import { z } from 'zod';
import { paginationSchema } from '../../utils/pagination.js';

export const taskStatusSchema = z.enum(['todo', 'in_progress', 'done']);
export const taskPrioritySchema = z.enum(['low', 'medium', 'high']);

export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type TaskPriority = z.infer<typeof taskPrioritySchema>;

const dueDateSchema = z.string().date();

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  status: taskStatusSchema.default('todo'),
  priority: taskPrioritySchema.default('medium'),
  due_date: dueDateSchema.optional(),
});

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000).nullable(),
    status: taskStatusSchema,
    priority: taskPrioritySchema,
    due_date: dueDateSchema.nullable(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });

export const listTasksQuerySchema = paginationSchema.extend({
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
