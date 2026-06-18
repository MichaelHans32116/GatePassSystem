// Prototype-only mock data and shared in-memory state.
var mockUsers = [
    { id: "MPI-001", name: "Ana Dela Cruz", role: "Associate", dept: "Production", password: "06172026" },
    { id: "SUP-01", name: "Roberto Santos", role: "Immediate Superior", dept: "Production", password: "01012020" },
    { id: "PRES", name: "President User", role: "President", dept: "Executive", password: "01012020" },
    { id: "HR", name: "PAS / HR Admin User", role: "PAS / HR Admin", dept: "HRAD", password: "01012020", canNoteGatePass: true },
    { id: "ADMIN", name: "Admin User", role: "Admin", dept: "Admin", password: "01012020", canNoteGatePass: true },
    { id: "ojt", name: "OJT System Admin", role: "System Admin", dept: "IT", password: "demo-password" },
    { id: "GUARD-1", name: "Agency Guard", role: "Security", dept: "Agency", password: "01012020" },
];

var mockVehicles = [
    { id: "V1", name: "Honda CRV", plate: "XYZ 123", driver: "Assigned Driver A", status: "Available" },
    { id: "V2", name: "Honda Accord", plate: "ABC 456", driver: "Assigned Driver B", status: "In Use" },
    { id: "V3", name: "Toyota Innova", plate: "QWE 789", driver: "Assigned Driver C", status: "Available" },
    { id: "V4", name: "Isuzu Truck", plate: "TRK 001", driver: "Assigned Driver D", status: "Available" }
];

var currentUser = null;
var gatePasses = [];
var currentViewedPassId = null;
var currentUploadedSig = null;
var currentOriginalSignatureData = null;
var currentLogPage = 1;
var logsPerPage = 5;

window.mockUsers = mockUsers;
window.mockVehicles = mockVehicles;
