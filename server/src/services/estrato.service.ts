import { prisma } from '../db.js'

export class EstratoService{
    static async list(){
        return prisma.estrato_catalog.findMany({orderBy: { value: 'asc' } })
    }
}