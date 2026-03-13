import { z } from "zod";

export const employeeSchema = z.object({
  employee_code: z
    .string()
    .min(1, "Código de empleado requerido")
    .max(20, "Máximo 20 caracteres"),
  first_name: z
    .string()
    .min(1, "Nombre requerido")
    .max(100, "Máximo 100 caracteres"),
  last_name: z
    .string()
    .min(1, "Apellido requerido")
    .max(100, "Máximo 100 caracteres"),
  identity_number: z
    .string()
    .min(1, "Número de identidad requerido")
    .max(30, "Máximo 30 caracteres"),
  email: z
    .string()
    .email("Email inválido")
    .or(z.literal(""))
    .optional()
    .default(""),
  phone: z.string().max(20, "Máximo 20 caracteres").optional().default(""),
  date_of_birth: z.string().optional().default(""),
  hire_date: z.string().min(1, "Fecha de contratación requerida"),
  department: z.string().optional().default(""),
  position: z
    .string()
    .min(1, "Puesto requerido")
    .max(100, "Máximo 100 caracteres"),
  base_salary: z.coerce
    .number()
    .min(0, "Salario debe ser positivo")
    .max(999_999_999.99, "Salario excede límite"),
  payment_method: z.enum(["bank_transfer", "check", "cash"], "Método de pago requerido"),
  bank_name: z.string().optional().default(""),
  bank_account: z.string().optional().default(""),
  status: z.enum(["active", "inactive", "on_leave", "terminated"], "Estado requerido"),
  country: z.enum(["HN", "SV", "GT", "NI", "CR", "PA"], "País requerido"),
});

export type EmployeeFormValues = z.infer<typeof employeeSchema>;
