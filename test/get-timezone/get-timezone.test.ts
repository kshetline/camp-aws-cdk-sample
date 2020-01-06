import { getTimezone } from '../../lib/get-timezone/get-timezone';

function extractZone(result: any): string | undefined {
  if (result && result.statusCode === 200 && typeof result.body === 'string') {
    const matches: any = JSON.parse(result.body);

    if (matches && matches.length > 0)
      return matches[0].zone;
  }

  return undefined;
}

test('should get correct timezones for cities', async () => {
  const event = { queryStringParameters: { city: 'nashua, nh' } };
  expect(extractZone(await getTimezone(event))).toEqual('America/New_York');
  event.queryStringParameters.city = 'paris, fra';
  expect(extractZone(await getTimezone(event))).toEqual('Europe/Paris');
});
