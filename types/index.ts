export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  position: string;
  department: string;
  salary: number;
  startDate: string;
  isActive: boolean;
}

export interface PayrollRecord {
  id: string;
  employeeId: string;
  period: string;
  grossSalary: number;
  deductions: number;
  netSalary: number;
  createdAt: string;
}
