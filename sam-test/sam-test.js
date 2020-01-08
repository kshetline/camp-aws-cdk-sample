const fs = require('fs');
const chalk = require('chalk');
const { spawnSync } = require('child_process');
const { isMatch } = require('lodash');

const CHECK_MARK = '\u2714';
const FAIL_MARK = '\u2718';

const testEventInfo = {
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
      expectedResult: body => body === 'rab' // Use functions for more elaborate results testing
    }
  ]
};

let lines;
let debugMode = false;
let singleFunctionName = '';
let singleFunctionIndex = 0;

process.argv.forEach(arg => {
  if (singleFunctionIndex === -1) {
    [singleFunctionName, singleFunctionIndex] = arg.split('.').map((s, index) => index === 1 ? Number(s) : s);
  }
  else if (arg === '-f') {
    singleFunctionIndex = -1;
  }
  else if (arg === '-d') {
    debugMode = true;
    console.log(chalk.magenta('Debug mode'));
  }
});

if (debugMode && (!singleFunctionName || singleFunctionIndex < 1)) {
  console.error(chalk.red('Debug mode requires a single function to be specified via -f'));
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
  if (/^\s*Type\: AWS\:\:Lambda\:\:Function\s*$/.test(line)) {
    const $ = /\s*(\w*)([0-9A-Z]{8}):\s*$/.exec(lastLine);

    if ($) {
      const name = $[1];
      const fullName = name + $[2];
      const events = testEventInfo[name];

      if (events && events.length > 0) {
        if (!singleFunctionName || singleFunctionName === name) {
          console.log(chalk.blue(name), chalk.gray('(' + fullName + ')'));
        }

        events.forEach((eventInfo, index) => {
          if (singleFunctionName && (singleFunctionName !== name || singleFunctionIndex !== index + 1)) {
            return;
          }

          ++testCount;

          const testName = eventInfo.testName;
          const expectedStatus = eventInfo.expectedStatus || 200;
          const expectedResult = eventInfo.expectedResult;
          const template = {
            body: `{"message": "${name}"}`,
            resource: "/{proxy+}",
            path: `/${name}`,
            httpMethod: "GET",
            isBase64Encoded: false
          };

          process.stdout.write(`  ${index + 1}: ${testName} `);

          delete eventInfo.testName;
          delete eventInfo.expectedStatus;
          delete eventInfo.expectedResult;
          Object.assign(template, eventInfo);

          fs.writeFileSync('sam-test/event.json', JSON.stringify(template, null, 2), { encoding: 'utf-8' });

          const args = [
              'local',
              'invoke',
              '-e',
              '"sam-test/event.json"'
            ];

          if (debugMode) {
            args.push('-d', '5858');
          }

          args.push(fullName);

          const results = spawnSync('sam', args, { encoding: 'utf-8', shell: true });

          if (results.stderr && (!results.stdout || results.stderr.startsWith('Traceback '))) {
            console.log(chalk.red(FAIL_MARK));
            console.error(chalk.red('    Test failed: ' + results.stderr));
          }
          else {
            let value;

            try {
              value = JSON.parse(results.stdout);

              if (value.errorType) {
                console.log(chalk.red(FAIL_MARK));
                console.error(chalk.red(`    ${value.errorType}${value.errorMessage ? ': ' + value.errorMessage : ''}`));
              }
              else if (value && value.statusCode != null && value.body) {
                try {
                  value.body = JSON.parse(value.body);
                }
                catch (err) {} // Leave value.body as string if it's not valid JSON

                if (value.statusCode === expectedStatus && testSucceeds(expectedResult, value.body)) {
                  ++successCount;
                  console.log(chalk.green(CHECK_MARK));
                }
                else {
                  console.log(chalk.red(FAIL_MARK));
                  console.error(chalk.red(`    response: ${results.stdout}`));
                }
              }
              else {
                console.log(chalk.red(FAIL_MARK));
                console.error(chalk.red(`    Malformed response: ${results.stdout}`));
              }
            }
            catch (err) {
              console.log(chalk.red(FAIL_MARK));
              console.error(chalk.red(`    Malformed response: ${results.stdout}\n    ${err}`));
            }
          }
        });
      }
    }
  }

  try {
    fs.unlinkSync('sam-test/event.json');
  }
  catch (err) {}

  lastLine = line;
});

console.log(`\nTest count: ${testCount}` +
  (successCount > 0 ? ', ' + chalk.green(`succeeded: ${successCount}`) : '') +
  (testCount - successCount > 0 ? ', ' + chalk.red(`failed: ${testCount - successCount}`) : ''));

process.exit(testCount === successCount ? 0 : 1);

function testSucceeds(expectedResult, body) {
  if (typeof expectedResult === 'function') {
    return expectedResult(body);
  }
  else {
    return isMatch(body, expectedResult);
  }
}
