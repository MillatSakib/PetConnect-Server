const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config()
const cookieParser = require('cookie-parser');
const port = process.env.PORT || 5000;

// middlewares

app.use(cookieParser());

app.use(
    cors({
        origin: [
            "http://localhost:5173",
            "http://localhost:5174",
            "https://petconnect0.netlify.app"
        ],
        credentials: true,
    })
);

app.use(express.json());


// custom middlewares 
const verifyToken = (req, res, next) => {
    try {
        if (!req.cookies) {
            const error = new Error('Unauthorized Access');
            return res.clearCookie("token", { ...cookieOptions, maxAge: 0 }).status(401).json({ error: error.message });
        }
        const token = req.cookies.token;
        jwt.verify(token, process.env.Access_Token_Secret, (err, decoded) => {
            if (err) {
                console.log(err);
                return res.clearCookie("token", { ...cookieOptions, maxAge: 0 }).status(401).send({ message: 'unauthorized access' })
            }
            req.decoded = decoded;
            next();
        })
    }
    catch (errors) {
        return res.clearCookie("token", { ...cookieOptions, maxAge: 0 }).status(401).send({ message: 'unauthorized access' });
    }
}


// Here I connect the Backend with Database

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.lm9a1gh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});


//Sample request response
app.get('/', (req, res) => {
    res.send('Pet is playing.');
})


// Reusable code

const jwtEmail = (token) => {
    try {
        const decoded = jwt.verify(token.token, process.env.Access_Token_Secret);
        return decoded.email;
    } catch (error) {
        return null;
    }
}


const cookieOptions = {
    httpOnly: true,     //Protect to access token using Javascript on client side
    secure: process.env.NODE_ENV === "production",  //If the site are in production then logic return ture and the data will transfer using HTTPS secure protocol. Otherwise the data will go through HTTP protocol.
    sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",        //Here as the wite are in production than the cors site essue are raise for different site. That's why set "samesite : none" for production. And when we run in localhost then "samesite : strict" as the ip are same. For this we will not CORS issue.
};


async function run() {
    try {


        const userCollection = client.db("petAdoption").collection("users");
        const petCollection = client.db("petAdoption").collection("allPets");

        app.get('/demo', async (req, res) => {
            res.status(200).send("Server Working Perfectly!")
        });


        //Here server make JWT token when the user are login or register
        //This is a tamplate. Not used in the frontend
        app.post('/accessToken', async (req, res) => {
            const user = req.body;
            if (user?.uid) {
                //Here check the user are avaiable or not in database using firebase User ID
                const result = await userCollection.findOne({ uid: user.uid })
                if (result) {
                    //Here if the user get then the accesstoken are given
                    const tokenPerameter = { email: result?.email };
                    if (result?.role === "admin") {
                        const token = jwt.sign(tokenPerameter, process.env.Access_Token_Secret, { expiresIn: '5h' });
                        res.cookie('token', token, cookieOptions).send({ success: true });
                    }
                    else if (result?.role === "user") {
                        const token = jwt.sign(tokenPerameter, process.env.Access_Token_Secret, { expiresIn: '720h' });
                        res.cookie('token', token, cookieOptions).send({ success: true });
                    }
                    else {
                        const error = new Error('Server Error');
                        res.clearCookie("token", { ...cookieOptions, maxAge: 0 }).status(401).json({ error: error.message });
                    }
                }
                else {
                    //If the user are not available then cookie will delete and send Unauthorized
                    const error = new Error('Unauthorized Access');
                    res.clearCookie("token", { ...cookieOptions, maxAge: 0 }).status(500).json({ error: error.message });
                }
            }
        })


        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            next();
        }


        //Here All Kind of Corner Case Handeled
        app.post("/userSign", async (req, res) => {
            const info = req.body;
            const insertInfo = {
                name: info?.name,
                uid: info?.uid,
                email: info.email,
            }
            const result = await userCollection.findOne({ uid: insertInfo.uid, email: insertInfo.email });
            const pesult = await userCollection.findOne({ $or: [{ uid: insertInfo.uid }, { email: insertInfo.email }] })
            if (!result && !pesult) {
                insertInfo.role = "user"
                const result1 = await userCollection.insertOne(insertInfo);
                if (result1?.acknowledged) {
                    const token = jwt.sign({ email: info.email }, process.env.Access_Token_Secret, { expiresIn: '720h' });
                    res.cookie('token', token, cookieOptions).send({ success: true })
                } else {
                    const error = new Error('Unauthorized Access');
                    return res.clearCookie("token", { ...cookieOptions, maxAge: 0 }).status(500).json({ error: error.message });
                }
            }
            else if (!result && pesult) {
                const error = new Error('Unauthorized Access');
                return res.clearCookie("token", { ...cookieOptions, maxAge: 0 }).status(500).json({ error: error.message });
            }
            else {
                const token = jwt.sign({ email: info.email }, process.env.Access_Token_Secret, { expiresIn: '720h' });
                return res.cookie('token', token, cookieOptions).send({ success: true })
            }
        })


        app.post("/addPet", verifyToken, async (req, res) => {
            const email = jwtEmail(req.cookies);
            const { petImgURL, petName, petAge, petCategory, petLocation, shortDescription, longDescription, time, adopted } = req.body;
            if (!petImgURL || !petName || !petAge || !petCategory || !petLocation || !shortDescription || !longDescription || !time || !email || adopted) {
                return res.status(400).json({ error: 'Please fillup all the input correctly!' });
            }
            else {
                try {
                    const petInfo = { petImgURL, petName, petAge, petCategory, petLocation, shortDescription, longDescription, time, adopted: false, email }
                    const result = await petCollection.insertOne(petInfo);
                    if (result.acknowledged) {
                        res.status(201).send("Pet Added Successfully!");
                    }
                    else {
                        return res.status(500).json({ error: "Internal error occured" })
                    }
                }
                catch (error) {
                    console.log("Got Error", error);
                    return res.status(500).json({ error: "Server Error" })
                }
            }
        })


        app.get("/myAddedPets", verifyToken, async (req, res) => {
            const email = jwtEmail(req.cookies);
            try {
                const result = await petCollection.find({ email: email }).toArray();
                res.status(200).send(result)
            }
            catch (error) {
                console.log("Got Error", error);
                return res.status(500).json({ error: "Server Error" })
            }
        })


    }
    finally { }
}
run().catch(console.dir);

app.listen(port, () => {
    console.log(`Pet is playing on port ${port}`);
})