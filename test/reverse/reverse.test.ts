import { reverse } from '../../lib/reverse/index';

test('should reverse strings', async () => {
  const event = { queryStringParameters: { s: 'abc' } };
  expect((await reverse(event)).body).toEqual('"cba"');
  event.queryStringParameters.s = '1';
  expect((await reverse(event)).body).toEqual('"1"');
  event.queryStringParameters.s = 'Hello';
  expect((await reverse(event)).body).toEqual('"olleH"');
});
