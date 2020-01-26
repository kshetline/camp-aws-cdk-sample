export default [
  {
    testName: "should get message",
    env: { foo: 'bar' },
    queryStringParameters: { s: "baz" },
    expectedResult: (value: any) => new Promise<boolean>(resolve => setTimeout(() => resolve(value.body === 'bar#baz'), 250))
  }
];
