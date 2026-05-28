import { pgTable, varchar, numeric, timestamp } from 'drizzle-orm/pg-core';

export const wallet = pgTable('wallet', {
  studentID: varchar('student_id', { length: 64 }).primaryKey(),
  balance: numeric('balance', { precision: 10, scale: 2 }).notNull(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
});