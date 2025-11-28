"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notFound = notFound;
function notFound(_req, res, _next) {
    res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Recurso não encontrado.',
    });
}
exports.default = notFound;
