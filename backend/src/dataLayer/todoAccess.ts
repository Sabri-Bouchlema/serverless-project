import * as AWS from 'aws-sdk'
import * as AWSXRay from 'aws-xray-sdk'

import { TodoItem } from '../models/TodoItem'
import { UpdateTodoRequest } from '../requests/UpdateTodoRequest'
import { DocumentClient } from 'aws-sdk/clients/dynamodb'


const XAWS = AWSXRay.captureAWS(AWS)

export class TodoAccess {

  constructor(
    private readonly docClient: DocumentClient = createDynamoDBClient(),
    private readonly s3 = createS3(),
    private readonly todosTable = process.env.TODOS_TABLE,
    private readonly todoIdIndexName = process.env.TODO_ID_INDEX_NAME,
    private readonly bucketName = process.env.IMAGES_S3_BUCKET,
    private readonly urlExpiration = process.env.SIGNED_URL_EXPIRATION
  ) {
  }

  async getAllTodos(userId: string): Promise<TodoItem[]> {
    console.log('Getting all todos')

    const result = await this.docClient.query({
      TableName: this.todosTable,
      IndexName: this.todoIdIndexName,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    }).promise()

    const items = result.Items
    return items as TodoItem[]
  }

  async createTodo(todo: TodoItem): Promise<TodoItem> {
    await this.docClient.put({
      TableName: this.todosTable,
      Item: todo
    }).promise()

    return todo
  }

  async updateTodo(userId: string, todoId: string, updatedTodo: UpdateTodoRequest): Promise<void> {


    const result = await this.docClient.query({
      TableName: this.todosTable,
      IndexName: this.todoIdIndexName,
      KeyConditionExpression: 'userId = :userId and todoId = :todoId',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':todoId': todoId
      }
    }).promise()

    await this.docClient.update({
      TableName: this.todosTable,
      Key: {
        userId: userId,
        createdAt: result.Items[0].createdAt
      },
      ConditionExpression: "todoId =:todoId",
      UpdateExpression: "set #namefield = :name, dueDate=:dueDate, done=:done",
      ExpressionAttributeValues: {
        ":todoId": todoId,
        ":name": updatedTodo.name,
        ":dueDate": updatedTodo.dueDate,
        ":done": updatedTodo.done
      },
      ExpressionAttributeNames: {
        "#namefield": "name"
      },
      ReturnValues: "UPDATED_NEW"
    }).promise()
  }

  async deleteTodo(userId: string, todoId: string): Promise<void> {


    const result = await this.docClient.query({
      TableName: this.todosTable,
      IndexName: this.todoIdIndexName,
      KeyConditionExpression: 'userId = :userId and todoId = :todoId',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':todoId': todoId
      }
    }).promise()

    await this.docClient.delete({
      TableName: this.todosTable,
      Key: {
        userId: userId,
        createdAt: result.Items[0].createdAt
      },
      ConditionExpression: "todoId =:todoId",
      ExpressionAttributeValues: {
        ":todoId": todoId
      }
    }).promise()
  }

  async generateUploadUrl(userId: string, todoId: string): Promise<string> {
    const result = await this.docClient.query({
      TableName: this.todosTable,
      IndexName: this.todoIdIndexName,
      KeyConditionExpression: 'userId = :userId and todoId = :todoId',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':todoId': todoId
      }
    }).promise()

    if (result.Count === 0) {
      throw Error("Todo item not found");
    }

    const todoItem = result.Items[0];

    if (!todoItem.attachmentUrl) {
      console.log("generate attachmentUrl to todo item : ", todoItem)

      const attachmentUrl = 'https://' + this.bucketName + '.s3.amazonaws.com/' + todoId

      await this.docClient.update({
        TableName: this.todosTable,
        Key: {
          userId: userId,
          createdAt: result.Items[0].createdAt
        },
        ConditionExpression: "todoId =:todoId",
        UpdateExpression: "set attachmentUrl = :attachmentUrl",
        ExpressionAttributeValues: {
          ":todoId": todoId,
          ":attachmentUrl": attachmentUrl
        },
        ReturnValues: "UPDATED_NEW"
      }).promise()
    } else {
      console.log("AttachmentUrl for todo item already generated", todoItem)
    }

    return this.getUploadUrl(todoId);
  }

  getUploadUrl(imageId: string): string {
    return this.s3.getSignedUrl('putObject', {
      Bucket: this.bucketName,
      Key: imageId,
      Expires: this.urlExpiration
    })
  }
}

function createDynamoDBClient() {
  if (process.env.IS_OFFLINE) {
    console.log('Creating a local DynamoDB instance')
    return new XAWS.DynamoDB.DocumentClient({
      region: 'localhost',
      endpoint: 'http://localhost:8000'
    })
  }

  return new XAWS.DynamoDB.DocumentClient()
}

function createS3() {
  return new XAWS.S3({
    signatureVersion: 'v4'
  })
}