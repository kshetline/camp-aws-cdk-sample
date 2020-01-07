export async function reverse(event: any): Promise<any> {
  const s = (event.queryStringParameters && event.queryStringParameters.s) || '';

  return { statusCode: 200, body: JSON.stringify(s.split('').reverse().join('')) };
}
