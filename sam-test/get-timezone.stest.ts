export default [
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
    expectedResult: [{ zone: 'Europe/Paris' }]
  }
];
