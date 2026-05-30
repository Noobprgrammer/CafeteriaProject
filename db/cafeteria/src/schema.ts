import{ pgTable, uuid, varchar, text, numeric, boolean, timestamp, pgEnum, integer, unique } from 'drizzle-orm/pg-core';

export const userStatusEnum = pgEnum('user_status', ['active', 'inactive']);

export const orderStatusEnum = pgEnum('order_status', [ 'paid', 'preparing', 'completed', 'collected']);

export const staffRoleEnum = pgEnum('staff_role', [ 'admin', 'staff']);

export const user = pgTable('user', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentID: varchar('student_id', { length: 64 }).notNull(),
  walletAmount: numeric('wallet_amount', { precision: 10, scale: 2 }).notNull(),
  token: varchar('token', { length: 128 }).notNull().unique(),
  status: userStatusEnum('status').notNull().default('active'),
  last_active_at: timestamp('last_active_at').notNull().defaultNow(),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const stall = pgTable('stall', {
    id: uuid('id').primaryKey().defaultRandom(),
    stall_name: varchar('stall_name', {length: 128}).notNull(),
})

export const staff = pgTable('staff', {
  id: uuid('id').primaryKey().defaultRandom(),
  stall_id: uuid('stall_id').references(() => stall.id),
  username: varchar('username', { length: 64 }).notNull().unique(),
  password: varchar('password', { length: 256 }).notNull(),
  role: staffRoleEnum('role').notNull(),
  token: varchar('token', { length: 128 }),
  last_active_at: timestamp('last_active_at'),
  is_delete: boolean('is_delete').notNull().default(false),    // ← NEW
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const menuItem = pgTable('menu_item', {
  id: uuid('id').primaryKey().defaultRandom(),
  stall_id: uuid('stall_id').notNull().references(() => stall.id),
  itemName: varchar('item_name', { length: 128 }).notNull(),
  description: text('description'),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  isAvailable: boolean('is_available').notNull().default(true),
  isDelete: boolean('is_delete').notNull().default(false),
  image: varchar('image', { length: 512 }),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const orderGroup = pgTable('order_group', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => user.id),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const orderList = pgTable(
  'order_list',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    order_group_id: uuid('order_group_id').notNull().references(() => orderGroup.id),
    stall_id: uuid('stall_id').notNull().references(() => stall.id),
    pin: varchar('pin', { length: 16 }).notNull(),
    status: orderStatusEnum('status').notNull().default('paid'),
    total_amount: numeric('total_amount', { precision: 10, scale: 2 }).notNull(),
    created_at: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    uniqueStallPin: unique('order_list_stall_pin_unique').on(
      table.stall_id,
      table.pin
    ),
  })
);

export const order = pgTable('order', {
  id: uuid('id').primaryKey().defaultRandom(),
  order_list_id: uuid('order_list_id')
    .notNull()
    .references(() => orderList.id),
  menu_id: uuid('menu_id')
    .notNull()
    .references(() => menuItem.id),
  quantity: integer('quantity').notNull(),
  created_at: timestamp('created_at').notNull().defaultNow(),
});