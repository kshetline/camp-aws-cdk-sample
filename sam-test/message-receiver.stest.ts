export default [
  {
    testName: "should get message",
    queryStringParameters: {
      s: "baz"
    },
    expectedResult: () => async () => new Promise<boolean>(resolve => setTimeout(() => resolve(true), 250))
  }
];
