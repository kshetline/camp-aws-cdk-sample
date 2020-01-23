import * as fs from 'fs';
import chalk from 'chalk';
import { spawnSync } from 'child_process';
import { isMatch } from 'lodash';

const TEST_PROPERTIES = ['testName', 'env', 'setup', 'expectedStatus', 'expectedResult', 'displayResult'];

// Modify testEventInfo to contain all of the lambdas you want to test, and one or more
// tests for each lambda.
const testEventInfo: any = {
  getTimezone: [
    {
      testName: "should get correct timezone for Fairbanks",
      queryStringParameters: {
        city: "fairbanks, ak"
      },
      expectedResult: [{city: 'Fairbanks, AK', zone: 'America/Anchorage' }]
    },
    {
      testName: "should get correct timezone for Marseille",
      queryStringParameters: {
        city: "Marseille, FRA"
      },
      expectedResult: [{zone: 'Europe/Paris' }] // Note: comparison to full result not required
    }
  ],
  reverse: [
    {
      testName: "should reverse string",
      queryStringParameters: {
        s: "foo"
      },
      expectedResult: 'oof'
    },
    {
      testName: "should reverse string with function to test result",
      queryStringParameters: {
        s: "bar"
      },
      expectedStatus: 200, // 200 is the default, so not needed here, but you can specify other status values
      expectedResult: (value: any) => value.body === 'rab' // Use functions for more elaborate results testing
    }
  ]
};

const CHECK_MARK = '\u2714';
const FAIL_MARK = '\u2718';

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

lines.forEach(line => {
  if (/^\s*Type: AWS::Lambda::Function\s*$/.test(line)) {
    const $ = /\s*(\w*)([0-9A-Z]{8}):\s*$/.exec(lastLine);

    if ($) {
      const name = $[1];

      performLambdaEvents(name, name + $[2], testEventInfo[name]);
    }
  }

  try {
    fs.unlinkSync('sam-test/event.json');
  } catch (err) { }

  try {
    fs.unlinkSync('sam-test/env.json');
  } catch (err) { }

  lastLine = line;
});

// tslint:disable-next-line: prefer-template
console.log(`\nTest count: ${testCount}` +
  (successCount > 0 ? ', ' + chalk.green(`succeeded: ${successCount}`) : '') +
  (testCount - successCount > 0 ? ', ' + chalk.red(`failed: ${testCount - successCount}`) : ''));

process.exit(testCount === successCount ? 0 : 1);

function performLambdaEvents(name: string, fullName: string, events: any[]): void {
  if (!events || events.length === 0) {
    return;
  }

  if (!singleFunctionName || singleFunctionName === name) {
    console.log(chalk.blue(name), chalk.gray(`(${fullName})`));
  }

  events.forEach((eventInfo, index) => performLambdaEvent(name, fullName, eventInfo, index));
}

function performLambdaEvent(name: string, fullName: string, eventInfo: any, index: number): void {
  if (singleFunctionName && (singleFunctionName !== name || (singleFunctionIndex > 0 && singleFunctionIndex !== index + 1))) {
    return;
  }

  ++testCount;

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

  fs.writeFileSync('sam-test/event.json', JSON.stringify(template, null, 2), { encoding: 'utf-8' });

  const args = [
    'local',
    'invoke',
    '-e',
    '"sam-test/event.json"'
  ];

  if (testParams.env) {
    fs.writeFileSync('sam-test/env.json', JSON.stringify({ [fullName]: testParams.env }));
    args.push('--env-vars', 'sam-test/env.json');
  }

  if (debugMode) {
    args.push('-d', '5858');
  }

  args.push(fullName);

  if (testParams.setup) {
    testParams.setup();
  }

  invokeSam(testParams, args);
}

// tslint:disable-next-line: cyclomatic-complexity
function invokeSam(testParams: any, args: string[]): void {
  const results = spawnSync('sam', args, { encoding: 'utf-8', shell: true });
  const stdout = (results.stdout ?? '').toString();
  const stderr = (results.stderr ?? '').toString();

  if (stderr && (!stdout || stderr.startsWith('Traceback '))) {
    console.log(chalk.red(FAIL_MARK));
    console.error(chalk.red('    Test failed: ' + stderr));
  } else {
    let value;

    try {
      value = JSON.parse(stdout);

      if (value.errorType) {
        console.log(chalk.red(FAIL_MARK));
        console.error(chalk.red(`    ${value.errorType}${value.errorMessage ? ': ' + value.errorMessage : ''}`));
      } else if (value && value.statusCode != null && typeof value.body === 'string') {
        try {
          value.body = JSON.parse(value.body);
        } catch (err) { } // Leave value.body as string if it's not valid JSON

        if (value.statusCode === testParams.expectedStatus && testSucceeds(testParams.expectedResult, value)) {
          ++successCount;
          console.log(chalk.green(CHECK_MARK));

          if (testParams.displayResult) {
            console.log(chalk.green('    ' + stdout.trim()));
          }
        } else {
          console.log(chalk.red(FAIL_MARK));
          console.error(chalk.red(`    response: ${stdout}`));
        }
      } else {
        console.log(chalk.red(FAIL_MARK));
        console.error(chalk.red(`    Malformed response: ${stdout}`));
      }
    } catch (err) {
      console.log(chalk.red(FAIL_MARK));
      console.error(chalk.red(`    Malformed response: ${stdout}\n    ${err}`));
    }
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

function testSucceeds(expectedResult: any, value: any): boolean {
  if (typeof expectedResult === 'function') {
    return expectedResult(value);
  } else {
    return isMatch(value.body, expectedResult);
  }
}
