export default [
  {
    testName: "should get message",
    expectedResult: async () => new Promise<boolean>(resolve => setTimeout(() => resolve(true), 500))
  }
];
