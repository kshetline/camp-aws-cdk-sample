export async function receiveMessage(event: any): Promise<any> {
  const s = (event.queryStringParameters?.s) ?? '?';

  return { statusCode: 200, body: (process.env.foo || '?') + '#' + s, event };
}
