// Prototype-only fallback data kept only for non-auth workflow UI states.
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
var logsPerPage = 15;

window.mockVehicles = mockVehicles;
