# CAMP AWS CDK Sample Project

This is a template project for TypeScript development with CDK.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

* `npm run build`: compile typescript to js
* `npm run watch`: watch for changes and compile
* `npm run test`: perform the jest unit tests
* `npm run synth-ns`: create/update SAM template needed for SAM testing
* `npm run test-local`: perform SAM invoke local testing (You may need to perform `synth-ns` before using this test)
* `npm run deploy`: build and deploy this stack to your default AWS account/region
* `npm run deploy-only`: deploy this stack to your default AWS account/region without first doing a build

The tests run by `npm run test-local` are defined at the top of the `sam-test/sam-test.js` file in the `testEventInfo` object. This object is indexed by lambda name, and each entry for each lambda containing an array of test names, event values, and test values or test functions for validating the return results of the corresponding lambda given particular event values.

## Debugging within Visual Studio Code

You must first perform `npm run build` to test the latest changes in your code.

### Using Jest

Run the VSCode "Jest Test" `launch.json` configuration.

### Using SAM

Run the VSCode "SAM Test" `launch.json` configuration.

You may need to perform `synth-ns` before using these tests.

This will test only one single pre-defined lambda function with one predefined event. To test multiple lambdas and events, either create additional `launch.json` configurations and corresponding tasks in `tasks.json` for each lambda and event to be tested, or modify the existing "SAM Test" configuration and corresponding task as needed.

The `localRoot` and `outFiles` properties in each `launch.json` configuration must reflect the `lib` and `dist/lib` directories of a particular lambda to be tested, and the `preLaunchTask` property must indicate a matching task in `tasks.json`.

The `command` property of the corresponding task in `tasks.json` must end with `-f` *functionName*.*1_basedIndex* for the lambda and event values to be tested, using the same tests specified for `npm run test-local`.
