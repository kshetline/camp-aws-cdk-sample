export async function receiveMessage(event: any): Promise<any> {
  // console.log(JSON.stringify(event));

  return { statusCode: 200, body: 'true' };
}
