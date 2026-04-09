/**
 * 异步路由包装器，捕获 async 函数中的错误并传递给 next()
 * 用法：router.get('/path', catchAsync(async (req, res, next) => { ... }))
 */
const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = catchAsync;
