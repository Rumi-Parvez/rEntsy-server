import cors from "cors";
import dotenv from "dotenv/config";
import express from "express"

const app = express();
const port = process.env.PORT || 5000


app.use(cors())
app.use(express.json())

app.get('/', (req , res) => {
    res.send({ message : "Welcome to the rEntsy Server"})
})


app.listen(port, ()=>{
    console.log(`The server is running on the PORT = ${port} and the url = http://localhost:${port}`);
})
