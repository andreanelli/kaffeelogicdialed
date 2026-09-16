import { handleRequest } from "../../cloud/handler.js";
export const onRequest = ({ request, env }) => handleRequest(request, env);
