const JSON_HEADERS = {
  "Content-Type": "application/json",
};

export function apiJson(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    status: init?.status ?? 200,
    headers: {
      ...JSON_HEADERS,
      ...init?.headers,
    },
  });
}

export function apiError(status: number, message: string, code: string): never {
  throw apiJson({ error: message, code }, { status });
}
