/**
 * Async route wrapper - catches errors from async route handlers
 * Usage: router.get('/path', catchAsync(async (req, res, next) => { ... }))
 */
const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = catchAsync;