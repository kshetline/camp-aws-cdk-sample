import AWS, { SNS } from 'aws-sdk';

AWS.config.update({ region: 'us-east-2' });

const sns = new AWS.SNS({ apiVersion: '2010-03-31' });
const NO_MATCH = ['', ''];

export async function getTopicArn(topicName: string): Promise<string | undefined> {
  const topicList = (await sns.listTopics({}).promise()).Topics;

  return topicList?.find(topicObj =>
    (/.*:(.+)$/.exec(topicObj.TopicArn ?? '') ?? NO_MATCH)[1] === topicName)?.TopicArn;
}

export async function createTopicOrUseExisting(topic: string | SNS.Types.CreateTopicInput): Promise<string | undefined> {
  const topicName = (typeof topic === 'string' ? topic : topic.Name);
  const topicInput = (typeof topic === 'string' ? { Name: topicName } : topic);
  let topicArn = await getTopicArn(topicName);

  if (!topicArn) {
    topicArn = (await sns.createTopic(topicInput).promise()).TopicArn;
  }

  return topicArn;
}

export async function subscribeLambdaToTopic(lambdaArn: string, topic: string): Promise<string | undefined> {
  const topicArn = (/:/.test(topic) ? topic : await getTopicArn(topic));

  if (!topicArn) {
    throw new Error(`Topic "${topic}" does not exist`);
  }

  const params = { Protocol: 'lambda', TopicArn: topicArn, Endpoint: lambdaArn };

  return (await sns.subscribe(params).promise()).SubscriptionArn;
}

export async function unsubscribe(subscriptionArn: string): Promise<void> {
  await sns.unsubscribe({ SubscriptionArn: subscriptionArn }).promise();
}

export async function publish(topicArn: string, message: string): Promise<void> {
  const params = { Message: message, TopicArn: topicArn };
  await new AWS.SNS({ apiVersion: '2010-03-31' }).publish(params).promise();
}

createTopicOrUseExisting('MyTopic2').then(topic => console.log(topic));
