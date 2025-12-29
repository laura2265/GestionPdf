import { Router } from "express";

export const smartOltRouter = Router();

smartOltRouter.get("/onu-get", async(req, res, next)=>{
    try{
        const dominiosmart = process.env.SMART_OLT_API_URL;
        const tokenSmart = process.env.SMART_OLT_TOKEN;

        if(!dominiosmart || !tokenSmart){
            return res.status(500).json({
                message: "Faltan variables DOMINIO_SMART o TOKEN_SMART"
            })
        }

        const response = await fetch(`${dominiosmart}`,{
            method: 'GET',
            headers: {
                "X-Token": tokenSmart,
                "Accept": "application/json",
            }
        })
        
        const result = await response.json();

        if(!response.ok){
            return res.status(response.status).json({
                message: "Error con SmartOlt",
                status: response.statusText,
                body: result
            })
        }


    }catch(error){

    }
})