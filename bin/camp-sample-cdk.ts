#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import { LambdaIntegration, RestApi } from '@aws-cdk/aws-apigateway';
import { CampSampleStack } from '../lib/camp-sample-stack';

const app = new cdk.App();
const stack = new CampSampleStack(app, 'CampSampleStack', {
  description: 'CAMP Sample Stack',
  stackName: 'camp-sample-stack'
});

const commonLayer = new lambda.LayerVersion(stack, 'CampSampleCommon', {
  code: lambda.Code.fromAsset('dist/nodejs'),
  compatibleRuntimes: [lambda.Runtime.NODEJS_12_X],
  description: 'Common code for sample lambdas',
});

const getTimeZone = new lambda.Function(stack, 'getTimezone', {
  runtime: lambda.Runtime.NODEJS_12_X,
  handler: 'index.getTimezone',
  code: lambda.Code.fromAsset('dist/lib/get-timezone'),
  layers: [commonLayer]
});

const reverse = new lambda.Function(stack, 'reverse', {
  runtime: lambda.Runtime.NODEJS_12_X,
  handler: 'index.reverse',
  code: lambda.Code.fromAsset('dist/lib/reverse'),
  layers: [commonLayer]
});

const messageReceiver = new lambda.Function(stack, 'messageReceiver', {
  runtime: lambda.Runtime.NODEJS_12_X,
  handler: 'index.receiveMessage',
  code: lambda.Code.fromAsset('dist/lib/message-receiver'),
  layers: [commonLayer],
  environment: {
    foo: '-'
  }
});

const api = new RestApi(stack, 'camp-aws-sample');

api.root.addResource('get-timezone').addMethod('GET', new LambdaIntegration(getTimeZone));
api.root.addResource('reverse').addMethod('GET', new LambdaIntegration(reverse));
