export default [
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
];
