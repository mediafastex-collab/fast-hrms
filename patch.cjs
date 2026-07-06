const fs = require('fs');
let code = fs.readFileSync('/tmp/App.tsx.backup', 'utf-8');

// 1. Add ImageIcon
code = code.replace(
  `  X,\n} from "lucide-react";`,
  `  X,\n  Image as ImageIcon,\n} from "lucide-react";`
);

// 2. Add payment_proof to Salary
code = code.replace(
  `  status: "Pending" | "Done";\n};`,
  `  status: "Pending" | "Done";\n  payment_proof?: string;\n};`
);

// 3. EmployeeDashboard Quote Logic
code = code.replace(
  `  const quote = useMemo(() => QUOTES[Math.floor(Math.random() * QUOTES.length)], []);`,
  `  const quote = useMemo(() => {\n    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 1000 / 60 / 60 / 24);\n    return QUOTES[dayOfYear % QUOTES.length];\n  }, []);`
);

// 4. Departments / ManagerList check employees & edit button change
code = code.replace(
  `  onEdit?: (row: Department) => void;`,
  `  onEdit?: (row: any) => void;\n  onCheckEmployees?: (row: any) => void;`
);

code = code.replace(
  `            <div className="flex shrink-0 gap-2">\n              {onEdit ? <button type="button" className="btn btn-soft" onClick={() => onEdit(row)}>Shift</button> : null}\n              <button type="button" className="btn btn-soft" onClick={() => onDelete(row.id)}>Delete</button>\n            </div>`,
  `            <div className="flex shrink-0 gap-2">\n              {onCheckEmployees ? <button type="button" className="btn btn-soft" onClick={() => onCheckEmployees(row)}>Employees</button> : null}\n              {onEdit ? <button type="button" className="btn btn-soft" onClick={() => onEdit(row)}>Edit</button> : null}\n              <button type="button" className="btn btn-soft" onClick={() => onDelete(row.id)}>Delete</button>\n            </div>`
);

code = code.replace(
  `function Departments() {\n  const [departments, setDepartments] = useState<Department[]>([]);\n  const [designations, setDesignations] = useState<Designation[]>([]);\n  const [companyDefaults, setCompanyDefaults] = useState<CompanySettings | null>(null);\n  const [departmentName, setDepartmentName] = useState("");\n  const [designationName, setDesignationName] = useState("");\n  const [message, setMessage] = useState("");\n  const [editingDept, setEditingDept] = useState<Department | null>(null);`,
  `function Departments() {\n  const [departments, setDepartments] = useState<Department[]>([]);\n  const [designations, setDesignations] = useState<Designation[]>([]);\n  const [companyDefaults, setCompanyDefaults] = useState<CompanySettings | null>(null);\n  const [departmentName, setDepartmentName] = useState("");\n  const [designationName, setDesignationName] = useState("");\n  const [message, setMessage] = useState("");\n  const [editingDept, setEditingDept] = useState<Department | null>(null);\n  const [checkingEmployeesDept, setCheckingEmployeesDept] = useState<Department | null>(null);\n  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);`
);

code = code.replace(
  `  useEffect(() => {\n    load().catch(console.error);\n  }, []);\n\n  async function create(kind: "departments" | "designations", name: string) {`,
  `  useEffect(() => {\n    load().catch(console.error);\n  }, []);\n\n  useEffect(() => {\n    if (checkingEmployeesDept && allEmployees.length === 0) {\n      api<{ employees: Employee[] }>("/employees").then(d => setAllEmployees(d.employees)).catch(console.error);\n    }\n  }, [checkingEmployeesDept, allEmployees.length]);\n\n  async function create(kind: "departments" | "designations", name: string) {`
);

code = code.replace(
  `      {editingDept ? (\n        <DepartmentShiftModal department={editingDept} companyDefaults={companyDefaults} onClose={() => setEditingDept(null)} onSave={saveDept} />\n      ) : null}\n    </section>\n  );\n}`,
  `      {editingDept ? (\n        <DepartmentShiftModal department={editingDept} companyDefaults={companyDefaults} onClose={() => setEditingDept(null)} onSave={saveDept} />\n      ) : null}\n\n      {checkingEmployeesDept ? (\n        <Modal title={\`\${checkingEmployeesDept.name} Employees\`} subtitle={\`All employees in the \${checkingEmployeesDept.name} department\`} onClose={() => setCheckingEmployeesDept(null)}>\n          <div className="max-h-96 overflow-y-auto">\n            {allEmployees.length === 0 ? (\n              <div className="p-4 text-center text-stone-500">Loading...</div>\n            ) : (\n              <div className="space-y-2">\n                {allEmployees.filter((e) => e.department_id === checkingEmployeesDept.id).length === 0 ? (\n                  <div className="p-4 text-center text-stone-500">No employees found in this department.</div>\n                ) : (\n                  allEmployees.filter((e) => e.department_id === checkingEmployeesDept.id).map((emp) => {\n                    const desig = designations.find(d => d.id === emp.designation_id)?.name || "Unknown Designation";\n                    return (\n                      <div key={emp.id} className="flex items-center justify-between rounded-lg border border-stone-200 bg-stone-50 p-3">\n                        <div className="font-semibold text-stone-800">{emp.full_name}</div>\n                        <div className="text-sm text-stone-500">{desig}</div>\n                      </div>\n                    );\n                  })\n                )}\n              </div>\n            )}\n          </div>\n          <div className="mt-4 flex justify-end">\n            <button type="button" className="btn btn-soft" onClick={() => setCheckingEmployeesDept(null)}>Close</button>\n          </div>\n        </Modal>\n      ) : null}\n    </section>\n  );\n}`
);

code = code.replace(
  `        <ManagerList title="Departments" value={departmentName} onValue={setDepartmentName} rows={departments} onCreate={() => create("departments", departmentName)} onDelete={(id) => remove("departments", id)} onEdit={setEditingDept} companyDefaults={companyDefaults} />\n        <ManagerList title="Designations" value={designationName} onValue={setDesignationName} rows={designations} onCreate={() => create("designations", designationName)} onDelete={(id) => remove("designations", id)} />`,
  `        <ManagerList title="Departments" value={departmentName} onValue={setDepartmentName} rows={departments} onCreate={() => create("departments", departmentName)} onDelete={(id) => remove("departments", id)} onEdit={setEditingDept} onCheckEmployees={setCheckingEmployeesDept} companyDefaults={companyDefaults} />\n        <ManagerList title="Designations" value={designationName} onValue={setDesignationName} rows={designations} onCreate={() => create("designations", designationName)} onDelete={(id) => remove("designations", id)} onEdit={(row) => {\n          const newName = window.prompt("Edit designation name:", row.name);\n          if (newName && newName.trim() !== "") {\n            api(\`/designations/\${row.id}\`, { method: "PUT", body: JSON.stringify({ name: newName.trim() }) }).then(load).catch(err => alert(err.message));\n          }\n        }} />`
);

// 5. Payroll logic
code = code.replace(
  `function Payroll({ isAdmin }: { isAdmin: boolean }) {\n  const now = new Date();\n  const [month, setMonth] = useState(now.getMonth() + 1);\n  const [year, setYear] = useState(now.getFullYear());\n  const [rows, setRows] = useState<Salary[]>([]);\n  const [editingSalary, setEditingSalary] = useState<Salary | null>(null);\n  const [editForm, setEditForm] = useState({\n    working_days: 0,\n    paid_days: 0,\n    gross_salary: 0,\n    deductions: 0,\n    net_salary: 0,\n  });`,
  `function Payroll({ isAdmin }: { isAdmin: boolean }) {\n  const d = new Date();\n  d.setMonth(d.getMonth() - 1);\n  const [month, setMonth] = useState(d.getMonth() + 1);\n  const [year, setYear] = useState(d.getFullYear());\n  const [period, setPeriod] = useState("Last 6 Months");\n  const [rows, setRows] = useState<Salary[]>([]);\n  const [editingSalary, setEditingSalary] = useState<Salary | null>(null);\n  const [payModalOpen, setPayModalOpen] = useState<{ id: number; employee: string } | null>(null);\n  const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);\n  const [payBusy, setPayBusy] = useState(false);\n  const [editForm, setEditForm] = useState({\n    working_days: 0,\n    paid_days: 0,\n    gross_salary: 0,\n    deductions: 0,\n    net_salary: 0,\n  });\n\n  async function processPaymentProof(file: File): Promise<string> {\n    return new Promise((resolve, reject) => {\n      const reader = new FileReader();\n      reader.readAsDataURL(file);\n      reader.onload = (event) => {\n        const img = new Image();\n        img.src = event.target?.result as string;\n        img.onload = () => {\n          const canvas = document.createElement("canvas");\n          const MAX_WIDTH = 800; const MAX_HEIGHT = 800;\n          let width = img.width; let height = img.height;\n          if (width > height) { if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; } }\n          else { if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; } }\n          canvas.width = width; canvas.height = height;\n          const ctx = canvas.getContext("2d");\n          ctx?.drawImage(img, 0, 0, width, height);\n          resolve(canvas.toDataURL("image/jpeg", 0.6));\n        };\n        img.onerror = reject;\n      };\n      reader.onerror = reject;\n    });\n  }\n\n  async function markPaidSubmit(e: React.FormEvent) {\n    e.preventDefault();\n    if (!payModalOpen) return;\n    setPayBusy(true);\n    try {\n      let base64 = "";\n      if (paymentProofFile) base64 = await processPaymentProof(paymentProofFile);\n      await api(\`/payroll/\${payModalOpen.id}\`, { method: "PUT", body: JSON.stringify({ status: "Paid", payment_proof: base64 || null }) });\n      setPayModalOpen(null); setPaymentProofFile(null); await load();\n    } catch (err) {\n      alert(err instanceof Error ? err.message : "Failed");\n    } finally {\n      setPayBusy(false);\n    }\n  }`
);

code = code.replace(
  `  async function load() {\n    const data = await api<{ salaries: Salary[] }>(\`/payroll?month=\${month}&year=\${year}\`);\n    setRows(data.salaries);\n  }`,
  `  async function load() {\n    let url = \`/payroll?month=\${month}&year=\${year}\`;\n    if (!isAdmin) {\n      url = \`/payroll?period=\${period === "Custom" ? "Custom" : period === "Last 6 Months" ? "Last 6 Months" : period === "Last 3 Months" ? "Last 3 Months" : "Last Month"}&month=\${month}&year=\${year}\`;\n    }\n    const data = await api<{ salaries: Salary[] }>(url);\n    setRows(data.salaries);\n  }`
);

code = code.replace(
  `      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-end">\n        <Field label="Month">\n          <select className="input" value={month} onChange={(e) => setMonth(Number(e.target.value))}>\n            {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((m, i) => (\n              <option key={m} value={i + 1}>{m}</option>\n            ))}\n          </select>\n        </Field>\n        <Field label="Year"><input className="input" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} /></Field>\n        <button type="button" className="btn btn-soft" onClick={load}><RefreshCcw size={17} />Load</button>\n        {isAdmin ? <button type="button" className="btn btn-primary" onClick={generate}><Banknote size={17} />Generate payroll</button> : null}\n      </div>`,
  `      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-end">\n        {!isAdmin && (\n          <Field label="Period">\n            <select className="input" value={period} onChange={(e) => setPeriod(e.target.value)}>\n              <option value="Last 6 Months">Last 6 Months</option>\n              <option value="Last 3 Months">Last 3 Months</option>\n              <option value="Last Month">Last Month</option>\n              <option value="Custom">Custom Month</option>\n            </select>\n          </Field>\n        )}\n        {(isAdmin || period === "Custom") && (\n          <>\n            <Field label="Month">\n              <select className="input" value={month} onChange={(e) => setMonth(Number(e.target.value))}>\n                {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((m, i) => (\n                  <option key={m} value={i + 1}>{m}</option>\n                ))}\n              </select>\n            </Field>\n            <Field label="Year"><input className="input" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} /></Field>\n          </>\n        )}\n        <button type="button" className="btn btn-soft" onClick={load}><RefreshCcw size={17} />{isAdmin ? "Load" : "Apply"}</button>\n        {isAdmin ? <button type="button" className="btn btn-primary" onClick={generate}><Banknote size={17} />Generate payroll</button> : null}\n      </div>`
);

code = code.replace(
  `                {isAdmin && (\n                  <>\n                    <button type="button" className="btn btn-soft" onClick={() => handleEditClick(row)}>Edit</button>\n                    {row.status !== "Done"\n                      ? <button type="button" className="btn btn-primary" onClick={() => setPaid(row.id, true)}>Mark paid</button>\n                      : <button type="button" className="btn btn-soft" onClick={() => setPaid(row.id, false)}>Mark unpaid</button>}\n                  </>\n                )}\n              </div>`,
  `                {row.payment_proof && (\n                  <a className="btn btn-soft" href={row.payment_proof} download={\`payment_proof_\${row.employee_name}_\${row.salary_month}.jpg\`} title="Payment Proof">\n                    <ImageIcon size={17} /><span className="hidden sm:inline">Proof</span>\n                  </a>\n                )}\n                {isAdmin && (\n                  <>\n                    <button type="button" className="btn btn-soft" onClick={() => handleEditClick(row)}>Edit</button>\n                    {row.status !== "Done"\n                      ? <button type="button" className="btn btn-primary" onClick={() => setPayModalOpen({ id: row.id, employee: row.employee_name || "Employee" })}>Mark paid</button>\n                      : <button type="button" className="btn btn-soft" onClick={() => setPaid(row.id, false)}>Mark unpaid</button>}\n                  </>\n                )}\n              </div>`
);

code = code.replace(
  `      {editingSalary && (\n        <Modal\n          title="Edit Salary Details"`,
  `      {payModalOpen && (\n        <Modal title="Mark as Paid" subtitle={\`Upload a payment screenshot for \${payModalOpen.employee}.\`} onClose={() => setPayModalOpen(null)}>\n          <form onSubmit={markPaidSubmit} className="space-y-4">\n            <Field label="Payment Screenshot (Optional)">\n              <input type="file" className="input file:mr-4 file:rounded-full file:border-0 file:bg-primary-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-700 hover:file:bg-primary-100" accept="image/*" onChange={(e) => setPaymentProofFile(e.target.files?.[0] || null)} />\n            </Field>\n            <div className="flex justify-end gap-3 pt-2">\n              <button type="button" className="btn btn-soft" onClick={() => setPayModalOpen(null)}>Cancel</button>\n              <button type="submit" className="btn btn-primary" disabled={payBusy}>{payBusy ? "Saving..." : "Confirm Payment"}</button>\n            </div>\n          </form>\n        </Modal>\n      )}\n\n      {editingSalary && (\n        <Modal\n          title="Edit Salary Details"`
);

fs.writeFileSync('src/App.tsx', code);
console.log('Patched successfully');
