import * as uuid from 'uuid'

import { CreateTodoRequest } from '../requests/CreateTodoRequest'
import { TodoAccess } from '../dataLayer/todoAccess'
import { TodoItem } from '../models/TodoItem';
import { UpdateTodoRequest } from '../requests/UpdateTodoRequest';

const todoAccess = new TodoAccess()

export async function getAllTodos(userId: string): Promise<TodoItem[]> {
  return todoAccess.getAllTodos(userId);
}

export async function createTodo(
  createTodoRequest: CreateTodoRequest,
  userId: string
): Promise<TodoItem> {

  return await todoAccess.createTodo({
    todoId: uuid.v4(),
    userId: userId,
    name: createTodoRequest.name,
    dueDate: createTodoRequest.dueDate,
    createdAt: new Date().toISOString(),
    done: false
  })
}

export async function updateTodo(
  userId: string,
  todoId: string,
  updatedTodo: UpdateTodoRequest
): Promise<void> {
  await todoAccess.updateTodo(userId, todoId, updatedTodo);
}

export async function deleteTodo(
  userId: string,
  todoId: string
): Promise<void> {
  await todoAccess.deleteTodo(userId, todoId);
}

export async function generateUploadUrl(
  userId: string,
  todoId: string
): Promise<string> {
  return await todoAccess.generateUploadUrl(userId, todoId);
}