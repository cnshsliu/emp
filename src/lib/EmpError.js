class EmpError extends Error {
  constructor(name, message, details) {
    super(message); // (1)
    this.name = name; // (2)
    this.details = details;
  }
}

module.exports = { EmpError };
