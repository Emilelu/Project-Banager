export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context)
  } catch (err) {
    if (err?.code !== 'ERR_MODULE_NOT_FOUND') throw err
    if (specifier.startsWith('.') || specifier.startsWith('/')) {
      for (const suffix of ['.js', '/index.js']) {
        try {
          return await nextResolve(specifier + suffix, context)
        } catch { /* try next */ }
      }
    }
    throw err
  }
}
