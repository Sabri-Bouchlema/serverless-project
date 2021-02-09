import * as AWS from 'aws-sdk'
import * as AWSXRay from 'aws-xray-sdk'

import { TodoItem } from '../models/TodoItem'
import { UpdateTodoRequest } from '../requests/UpdateTodoRequest'
import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { createLogger } from '../utils/logger'


const XAWS = AWSXRay.captureAWS(AWS)
const logger = createLogger('todo-access')

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
    logger.info(`Getting all todos for user ${userId}`)

    const result = await this.docClient.query({
      TableName: this.todosTable,
      IndexName: this.todoIdIndexName,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    }).promise()

    const items = result.Items
    logger.info("Todos list has been fetched successfully")
    return items as TodoItem[]
  }

  async createTodo(todo: TodoItem): Promise<TodoItem> {
    logger.info(`Start creating a todo item ${todo}`)

    await this.docClient.put({
      TableName: this.todosTable,
      Item: todo
    }).promise()

    logger.info(`Todo item has been created successfully ${todo}`)
    return todo
  }

  async updateTodo(userId: string, todoId: string, updatedTodo: UpdateTodoRequest): Promise<void> {
    logger.info(`Start updating todo item  ${updatedTodo}`)

    const todoItem = await this.getTodoItem(userId, todoId);

    await this.docClient.update({
      TableName: this.todosTable,
      Key: {
        userId: todoItem.userId,
        createdAt: todoItem.createdAt
      },
      ConditionExpression: "todoId =:todoId",
      UpdateExpression: "set #namefield = :name, dueDate=:dueDate, done=:done",
      ExpressionAttributeValues: {
        ":todoId": todoItem.todoId,
        ":name": updatedTodo.name,
        ":dueDate": updatedTodo.dueDate,
        ":done": updatedTodo.done
      },
      ExpressionAttributeNames: {
        "#namefield": "name"
      },
      ReturnValues: "UPDATED_NEW"
    }).promise()

    logger.info(`Todo item has been successfully updated ${updatedTodo}`)
  }

  async deleteTodo(userId: string, todoId: string): Promise<void> {

    const todoItem = await this.getTodoItem(userId, todoId);

    await this.docClient.delete({
      TableName: this.todosTable,
      Key: {
        userId: todoItem.userId,
        createdAt: todoItem.createdAt
      },
      ConditionExpression: "todoId =:todoId",
      ExpressionAttributeValues: {
        ":todoId": todoItem.todoId
      }
    }).promise()
  }

  async generateUploadUrl(userId: string, todoId: string): Promise<string> {

    const todoItem = await this.getTodoItem(userId, todoId);

    if (!todoItem.attachmentUrl) {
      logger.info(`Set attachmentUrl for todo item ${todoItem}`)
      await this.setAttachmentUrl(todoItem);
    } else {
      logger.info(`AttachmentUrl for todo item already setted ${todoItem}`)
    }

    return this.getUploadUrl(todoItem.todoId);
  }

  getUploadUrl(imageId: string): string {
    return this.s3.getSignedUrl('putObject', {
      Bucket: this.bucketName,
      Key: imageId,
      Expires: this.urlExpiration
    })
  }

  async getTodoItem(userId: string, todoId: string): Promise<TodoItem> {
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
      throw Error(`Cannot find todo item with id : ${todoId}`);
    }

    return result.Items[0] as TodoItem;
  }

  async setAttachmentUrl(todoItem: TodoItem): Promise<void> {
    const attachmentUrl = 'https://' + this.bucketName + '.s3.amazonaws.com/' + todoItem.todoId

    await this.docClient.update({
      TableName: this.todosTable,
      Key: {
        userId: todoItem.userId,
        createdAt: todoItem.createdAt
      },
      ConditionExpression: "todoId =:todoId",
      UpdateExpression: "set attachmentUrl = :attachmentUrl",
      ExpressionAttributeValues: {
        ":todoId": todoItem.todoId,
        ":attachmentUrl": attachmentUrl
      },
      ReturnValues: "UPDATED_NEW"
    }).promise()
  }
}

function createDynamoDBClient() {
  if (process.env.IS_OFFLINE) {
    logger.info('Creating a local DynamoDB instance')
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