import AWS, { Lambda } from 'aws-sdk';
import chalk from 'chalk';
import { ChildProcess, exec, execSync } from 'child_process';
import * as fs from 'fs';
import { isEqual, isMatch } from 'lodash';

AWS.config.update({ region: 'none' }); // The region doesn't appear to be used, but needs to be specified anyway.

const TEST_PROPERTIES = ['testName', 'env', 'setup', 'expectedStatus', 'expectedResult', 'displayResult'];

// Register tests in testEventInfo:
//   testName: require('./test-file-name.stest').default,
const testEventInfo: any = {
  getTimezone: require('./get-timezone.stest').default,
  reverse: require('./reverse.stest').default,
  messageReceiver: require('./message-receiver.stest').default,
};

const CHECK_MARK = '\u2714';
const FAIL_MARK = '\u2718';

const PYTHON_TASK_PATTERN = /^python\.exe\s+(\d+)\s+Console\s+/;

const lambda = new Lambda({
  apiVersion: '2015-03-31',
  endpoint: 'http://127.0.0.1:3001',
  sslEnabled: false,
  maxRetries: 0
});

let samProcess: ChildProcess;
let samProcessEnv: any;
let pythonProcesses = new Set<string>();
let samPythonProcessId: string;
let samFailed = false;
let lines: string[];
let debugMode = false;
let singleFunctionName = '';
let singleFunctionIndex = 0;
let getFunctionArg = false;

process.argv.forEach(arg => {
  if (getFunctionArg) {
    getFunctionArg = false;
    [singleFunctionName, singleFunctionIndex] = arg.split('.').map((s, index) => index === 1 ? s === '*' ? -1 : Number(s) : s) as [string, number];
  } else if (arg === '-f') {
    getFunctionArg = true;
  } else if (arg === '-d') {
    debugMode = true;
    console.log(chalk.magenta('Debug mode'));
  }
});

if (debugMode && (!singleFunctionName || singleFunctionIndex < 1)) {
  console.error(chalk.red('Debug mode requires a single function and index to be specified via -f'));
  process.exit(1);
}

try {
  lines = fs.readFileSync('./template.yaml', { encoding: 'utf-8' }).split(/\r\n|\n|\r/);
} catch (err) {
  console.error(chalk.red('template.yaml not found'));
  process.exit(1);
}

let lastLine = '';
let testCount = 0;
let successCount = 0;

(async () => {
  for (const line of lines) {
    if (/^\s*Type: AWS::Lambda::Function\s*$/.test(line)) {
      const $ = /\s*(\w*)([0-9A-Z]{8}):\s*$/.exec(lastLine);

      if ($) {
        const name = $[1];

        await performLambdaEvents(name, name + $[2], testEventInfo[name]);

        if (samFailed) {
          break;
        }
      }
    }

    try {
      fs.unlinkSync('sam-test/env.json');
    } catch (err) { }

    lastLine = line;
  }

  samStopLambdas();

  if (!samFailed) {
    // tslint:disable-next-line: prefer-template
    console.log(`\nTest count: ${testCount}` +
      (successCount > 0 ? ', ' + chalk.green(`succeeded: ${successCount}`) : '') +
      (testCount - successCount > 0 ? ', ' + chalk.red(`failed: ${testCount - successCount}`) : ''));
  }

  process.exit(testCount === successCount ? 0 : 1);
})();

async function performLambdaEvents(name: string, fullName: string, events: any[]): Promise<void> {
  if (!events || events.length === 0) {
    return;
  }

  if (!singleFunctionName || singleFunctionName === name) {
    console.log(chalk.blue(name), chalk.gray(`(${fullName})`));
  }

  for (let i = 0; i < events.length && !samFailed; ++i) {
    await performLambdaEvent(name, fullName, events[i], i);
  }
}

async function performLambdaEvent(name: string, fullName: string, eventInfo: any, index: number): Promise<void> {
  if (singleFunctionName && (singleFunctionName !== name || (singleFunctionIndex > 0 && singleFunctionIndex !== index + 1))) {
    return;
  }

  ++testCount;

  try {
    await samStartLambdas(eventInfo.env ? { [fullName]: eventInfo.env } : undefined);
  } catch (err) {
    samFailed = true;
    console.error(chalk.red('Failed to start lambdas: ' + err));

    return;
  }

  const testParams = extractTestParams(eventInfo);
  const template = {
    body: `{"message": "${name}"}`,
    resource: '/{proxy+}',
    path: `/${name}`,
    httpMethod: 'GET',
    isBase64Encoded: false
  };

  process.stdout.write(`  ${index + 1}: ${testParams.testName} `);
  Object.assign(template, eventInfo);
  const lambdaParams: Lambda.InvocationRequest = {
    FunctionName: fullName,
    Payload: JSON.stringify(template)
  };

  if (testParams.setup) {
    const possiblePromise = testParams.setup();

    if (possiblePromise instanceof Promise) {
      await possiblePromise;
    }
  }

  await invokeLambda(testParams, lambdaParams);
}

// tslint:disable-next-line: cyclomatic-complexity
async function invokeLambda(testParams: any, lambdaParams: Lambda.InvocationRequest): Promise<void> {
  let results: Lambda.InvocationResponse;

  try {
    results = await lambda.invoke(lambdaParams).promise();
  } catch (err) {
    console.log(chalk.red(FAIL_MARK));
    console.error(chalk.red('    Test failed: ' + err));

    return;
  }

  const payload = (results?.Payload || '').toString();
  let value: any;

  try {
    value = JSON.parse(payload);

    if (value.errorType) {
      console.log(chalk.red(FAIL_MARK));
      console.error(chalk.red(`    ${value.errorType}${value.errorMessage ? ': ' + value.errorMessage : ''}`));
    } else if (value && value.statusCode != null && typeof value.body === 'string') {
      try {
        value.body = JSON.parse(value.body);
      } catch (err) { } // Leave value.body as string if it's not valid JSON

      if (value.statusCode === testParams.expectedStatus && await testSucceeds(testParams.expectedResult, value)) {
        ++successCount;
        console.log(chalk.green(CHECK_MARK));

        if (testParams.displayResult) {
          console.log(chalk.green('    ' + payload.trim()));
        }
      } else {
        console.log(chalk.red(FAIL_MARK));
        console.error(chalk.red(`    response: ${payload}`));
      }
    } else {
      console.log(chalk.red(FAIL_MARK));
      console.error(chalk.red(`    Malformed response: ${payload}`));
    }
  } catch (err) {
    console.log(chalk.red(FAIL_MARK));
    console.error(chalk.red(`    Malformed response: ${payload}\n    ${err}`));
  }
}

function extractTestParams(eventInfo: any): any {
  const testParams: any = {};

  TEST_PROPERTIES.forEach(property => {
    if (property in eventInfo) {
      testParams[property] = eventInfo[property];
      delete eventInfo[property];
    }
  });

  testParams.expectedStatus = testParams.expectedStatus || 200;

  return testParams;
}

async function testSucceeds(expectedResult: any, value: any): Promise<boolean> {
  if (typeof expectedResult === 'function') {
    const result = expectedResult(value);

    if (result instanceof Promise) {
      return !!(await result);
    } else {
      return !!result;
    }
  } else {
    return isMatch(value.body, expectedResult);
  }
}

async function samStartLambdas(env?: any): Promise<void> {
  if (samProcess) {
    if (isEqual(samProcessEnv, env)) {
      return;
    }

    samProcessEnv = env;
    samStopLambdas();
  }

  const args = ['local', 'start-lambda'];

  if (env) {
    fs.writeFileSync('sam-test/env.json', JSON.stringify(env));
    args.push('--env-vars', 'sam-test/env.json');
  }

  if (debugMode) {
    args.push('-d', '5858');
  }

  findExistingPythonProcesses();
  samProcess = exec(['sam', ...args].join(' '));

  // Give the process some time to start up and be ready to receive events.
  return new Promise<void>((resolve, reject) => {
    let resolved = false;
    let rejected = false;
    let output = '';
    let timer: any;

    samProcess.on('error', err => {
      if (!resolved) {
        rejected = true;
        reject(err);
      }
    });
  
    const monitorStderr = (data: any) => {
      output += data.toString();

      if (!resolved && !rejected && output.includes('(Press CTRL+C to quit)')) {
        if (timer) {
          clearTimeout(timer);
          timer = undefined;
        }

        resolved = true;
        findNewPythonProcess();
        samProcess.stderr?.off('data', monitorStderr);
        resolve();
      }
    };
  
    samProcess.stderr?.on('data', monitorStderr);

    timer = setTimeout(() => {
      timer = undefined;

      if (!resolved && !rejected) {
        resolved = true;
        findNewPythonProcess();
        samProcess.stderr?.off('data', monitorStderr);
        resolve();
      }
    }, 15000);
  });
}

function findExistingPythonProcesses(): void {
  try {
    const tasks = execSync('tasklist').toString().split(/\r\n|\r|\n/);
    tasks.forEach(task => {
      const $ = PYTHON_TASK_PATTERN.exec(task);

      if ($) {
        pythonProcesses.add($[1]);
      }
    });
  }
  catch (err) {}
}

function findNewPythonProcess(): void {
  try {
    const tasks = execSync('tasklist').toString().split(/\r\n|\r|\n/);
    for (let task of tasks) {
      const $ = PYTHON_TASK_PATTERN.exec(task);

      if ($ && !pythonProcesses.has($[1])) {
        samPythonProcessId = $[1];
        break;
      }
    }
  }
  catch (err) {}
}

function samStopLambdas(): void {
  if (samProcess?.kill && !samProcess.killed) {
    samProcess.kill();

    if (samPythonProcessId) {
      try {
        execSync('taskkill /f /pid ' + samPythonProcessId);
        samPythonProcessId = '';
      } catch (err) {}
    }

    samProcess = undefined;
    pythonProcesses.clear();
  }
}
