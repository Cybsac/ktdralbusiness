"use client";
import { DataProvider, fetchUtils } from "react-admin";
const call = async (url: string, options: RequestInit = {}) => {
  const { json } = await fetchUtils.fetchJson(url, {
    ...options,
    credentials: "include",
    headers: new Headers({ "Content-Type": "application/json" }),
  });
  return json;
};
const record = (json: any) => json.user || json.data || json;
const list = (json: any, resource: string) => {
  const data = json.data || json.users || json.persons || json[resource] || [];
  return { data, total: json.total ?? data.length };
};
const date = (value: unknown) => (value ? String(value).split("T")[0] : null);
function userPayload(data: any, create = false) {
  if (create)
    return {
      username: data.username,
      password: data.password,
      role: data.role,
      person: {
        name: data.personName,
        dni: data.dni,
        area: data.area,
        whatsapp: data.whatsapp || null,
        birthday: date(data.birthday),
      },
    };
  const result: Record<string, unknown> = {};
  for (const key of ["username", "dni", "personName", "role", "area"])
    if (data[key] !== undefined) result[key] = data[key];
  if (data.whatsapp !== undefined) result.whatsapp = data.whatsapp || null;
  if (data.birthday !== undefined) result.birthday = date(data.birthday);
  if (typeof data.password === "string" && data.password.trim()) result.password = data.password;
  return result;
}
function listUrl(resource: string, params: any, reference = false) {
  const pagination = params.pagination || { page: 1, perPage: 10 };
  const sort = params.sort || { field: "id", order: "ASC" };
  const filter = { ...params.filter, ...(reference ? { [params.target]: params.id } : {}) };
  const query = new URLSearchParams({
    sort: JSON.stringify([sort.field, sort.order]),
    range: JSON.stringify([
      (pagination.page - 1) * pagination.perPage,
      pagination.page * pagination.perPage - 1,
    ]),
    filter: JSON.stringify(filter),
  });
  return `/api/admin/${resource}?${query}`;
}
export const dataProvider: DataProvider = {
  getList: async (resource, params) => list(await call(listUrl(resource, params)), resource),
  getOne: async (resource, params) => ({
    data: record(await call(`/api/admin/${resource}/${encodeURIComponent(params.id)}`)),
  }),
  getMany: async (resource, params) =>
    list(
      await call(
        `/api/admin/${resource}?${new URLSearchParams({ filter: JSON.stringify({ id: params.ids }) })}`
      ),
      resource
    ),
  getManyReference: async (resource, params) =>
    list(await call(listUrl(resource, params, true)), resource),
  create: async (resource, params) => ({
    data: record(
      await call(`/api/admin/${resource}`, {
        method: "POST",
        body: JSON.stringify(resource === "users" ? userPayload(params.data, true) : params.data),
      })
    ),
  }),
  update: async (resource, params) => ({
    data: record(
      await call(`/api/admin/${resource}/${encodeURIComponent(params.id)}`, {
        method: "PATCH",
        body: JSON.stringify(resource === "users" ? userPayload(params.data) : params.data),
      })
    ),
  }),
  updateMany: async (resource, params) => {
    await Promise.all(
      params.ids.map((id) =>
        call(`/api/admin/${resource}/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify(resource === "users" ? userPayload(params.data) : params.data),
        })
      )
    );
    return { data: params.ids };
  },
  delete: async (resource, params) => {
    const json = await call(`/api/admin/${resource}/${encodeURIComponent(params.id)}`, {
      method: "DELETE",
    });
    return { data: json.data || params.previousData || { id: params.id } };
  },
  deleteMany: async (resource, params) => {
    await Promise.all(
      params.ids.map((id) =>
        call(`/api/admin/${resource}/${encodeURIComponent(id)}`, { method: "DELETE" })
      )
    );
    return { data: params.ids };
  },
};
