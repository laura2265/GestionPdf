import { prisma } from "../db.js";

export class RoleService{
    static list(){
        return prisma.roles.findMany({orderBy:{id: 'asc'}})
    }
}