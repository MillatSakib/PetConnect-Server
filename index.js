const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config()
const cookieParser = require('cookie-parser');
const port = process.env.PORT || 5000;
const os = require('os');
const osu = require('node-os-utils');
const cpu = osu.cpu;
const mem = osu.mem;
const sysOs = osu.os;

// middlewares

app.use(cookieParser());

app.use(
    cors({
        origin: [
            "http://localhost:5173",
            "http://localhost:5174",
            "https://petconnect0.netlify.app",
            "https://petconnect0aaaa.netlify.app"
        ],
        credentials: true,
    })
);

app.use(express.json());


// custom middlewares 
const verifyToken = (req, res, next) => {

    try {
        if (!req.cookies) {

            const error = new Error('Unauthorized Access1');
            return res.status(401).json({ error: error.message });
        }
        const token = req.cookies.token;
        jwt.verify(token, process.env.Access_Token_Secret, (err, decoded) => {
            if (err) {
                return res.status(401).send({ message: 'unauthorized access2' })
            }
            req.decoded = decoded;
            next();
        })
    }
    catch (errors) {
        return res.status(401).send({ message: 'unauthorized access3' });
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



// Reusable code

const jwtEmail = (token) => {
    try {
        const decoded = jwt.verify(token.token, process.env.Access_Token_Secret);
        return decoded.email;
    } catch (error) {
        return null;
    }
}

const jwtUserId = (token) => {
    try {
        const decoded = jwt.verify(token.token, process.env.Access_Token_Secret);
        return decoded.uid;
    } catch (error) {
        return null;
    }
}



//Sample request response
app.get('/', (req, res) => {
    res.send('Pet is playing.');
})

const cookieOptions = {
    httpOnly: true,     //Protect to access token using Javascript on client side
    secure: process.env.NODE_ENV === "production",  //If the site are in production then logic return ture and the data will transfer using HTTPS secure protocol. Otherwise the data will go through HTTP protocol.
    sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",        //Here as the wite are in production than the cors site essue are raise for different site. That's why set "samesite : none" for production. And when we run in localhost then "samesite : strict" as the ip are same. For this we will not CORS issue.
};


async function run() {
    try {


        const userCollection = client.db("petAdoption").collection("users");
        const petCollection = client.db("petAdoption").collection("allPets");
        const adoptionReqCollection = client.db("petAdoption").collection("adoptionReq");
        const donationCampaingCollection = client.db("petAdoption").collection("donationCampaign");
        const donatorCollection = client.db("petAdoption").collection('donator');
        const apiHits = client.db("petAdoption").collection('apiHits');
        const apiError = client.db("petAdoption").collection('apiError');

        const errorCase = async (apiRoute, cookie, message) => {
            const errorData = {
                userEmail: jwtEmail(cookie),
                userUid: jwtUserId(cookie),
                errorMessage: message,
                time: Date.now(),
                api: apiRoute
            }
            await apiError.insertOne(errorData);
        }
        const publicErrorCase = async (apiRoute, message) => {
            const errorData = {
                userEmail: anonymous,
                userUid: anonymous,
                errorMessage: message,
                time: Date.now(),
                api: apiRoute
            }
            await apiError.insertOne(errorData);
        }


        //Here server make JWT token when the user are login or register
        //This is a template. Not used in the frontend
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
                        res.status(401).json({ error: error.message });
                    }
                }
                else {
                    //If the user are not available then cookie will delete and send Unauthorized
                    const error = new Error('Unauthorized Access');
                    res.status(500).json({ error: error.message });
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

        app.get("/totalApiHit", verifyToken, verifyAdmin, async (req, res) => {
            res.send(await apiHits.findOne({ api: "allApi" }, { projection: { _id: 0, api: 1, hitCount: 1 } }));
        })
        //Here All Kind of Corner Case Handeled
        app.post("/userSign", async (req, res) => {
            try {
                await Promise.all([
                    apiHits.updateOne({ api: "/userSign" }, { $inc: { hitCount: 1 } }),
                    apiHits.updateOne({ api: "allApi" }, { $inc: { hitCount: 1 } })
                ]);
                const info = req.body;
                if (!info.displayName || !info.uid || !info.email || !info.photoURL) {
                    res.send("Forbidden Access!")
                }
                else {
                    const insertInfo = {
                        name: info.displayName,
                        uid: info.uid,
                        email: info.email,
                        photoURL: info.photoURL
                    }
                    const result = await userCollection.findOne({ uid: insertInfo.uid, email: insertInfo.email });
                    const pesult = await userCollection.findOne({ $or: [{ uid: insertInfo.uid }, { email: insertInfo.email }] })
                    if (!result && !pesult) {

                        insertInfo.role = "user"
                        const result1 = await userCollection.insertOne(insertInfo);
                        if (result1?.acknowledged) {
                            const jwtSign = { email: info.email, uid: info.uid }
                            const token = jwt.sign(jwtSign, process.env.Access_Token_Secret, { expiresIn: '720h' });
                            res.cookie('token', token, cookieOptions).send({ success: true })
                        } else {
                            const error = new Error('Unauthorized Access');
                            res.status(500).json({ error: error.message });
                        }
                    }
                    else if (!result && pesult) {
                        const error = new Error('Unauthorized Access');
                        res.status(500).json({ error: error.message });
                    }
                    else {
                        if (info.email === result.email) {
                            const jwtSign = { email: info.email, uid: info.uid }
                            const token = jwt.sign(jwtSign, process.env.Access_Token_Secret, { expiresIn: '720h' });
                            res.cookie('token', token, cookieOptions).send({ success: true })
                        }
                        else {
                            const error = new Error('Unauthorized Access');
                            res.status(500).json({ error: error.message });
                        }
                    }
                }
            }
            catch (error) {
                const errorCollection = { userEmail: req.body?.email, userUid: req.body?.uid, errorMessage: error.message, time: Date.now(), api: "/userSign" }
                await apiError.insertOne(errorCollection);
                res.send("Internal server Error!");
            }
        })


        app.get("/verifyAdmin", verifyToken, verifyAdmin, async (req, res) => {
            try {
                await Promise.all([
                    apiHits.updateOne({ api: "/verifyAdmin" }, { $inc: { hitCount: 1 } }),
                    apiHits.updateOne({ api: "allApi" }, { $inc: { hitCount: 1 } })
                ]);
                res.send({ message: "have access" })
            }
            catch (error) {
                errorCase("/verifyAdmin", req.cookies, error.message);
                res.send("Internal Server Error!");
            }
        })

        app.post("/addPet", verifyToken, async (req, res) => {
            try {
                await Promise.all([
                    apiHits.updateOne({ api: "/addPet" }, { $inc: { hitCount: 1 } }),
                    apiHits.updateOne({ api: "allApi" }, { $inc: { hitCount: 1 } })
                ]);
                const email = jwtEmail(req.cookies);
                const { petImgURL, petName, petAge, petCategory, petLocation, shortDescription, longDescription, time, adopted } = req.body;
                if (!petImgURL || !petName || !petAge || !petCategory || !petLocation || !shortDescription || !longDescription || !time || !email || adopted) {
                    return res.status(400).json({ error: 'Please fill up all the input correctly!' });
                }
                else {

                    const petInfo = { petImgURL, petName, petAge, petCategory, petLocation, shortDescription, longDescription, time, adopted: false, email }
                    const result = await petCollection.insertOne(petInfo);
                    if (result.acknowledged) {
                        res.status(201).send("Pet Added Successfully!");
                    }
                    else {
                        return res.status(500).json({ error: "Internal error occured" })
                    }
                }
            }
            catch (error) {
                console.log(error);
                errorCase("/addPet", req.cookies, error.message);
                return res.status(500).json({ error: "Server Error" })
            }
        })


        app.get("/myAddedPets", verifyToken, async (req, res) => {
            try {
                await Promise.all([
                    apiHits.updateOne({ api: "/myAddedPets" }, { $inc: { hitCount: 1 } }),
                    apiHits.updateOne({ api: "allApi" }, { $inc: { hitCount: 1 } })
                ]);
                const email = jwtEmail(req.cookies);
                const result = await petCollection.find({ email: email }, { projection: { petName: 1, petCategory: 1, adopted: 1, petImgURL: 1 } }).toArray();
                res.status(200).send(result)
            }
            catch (error) {
                errorCase("/myAddedPets", req.cookies, error.message);
                return res.status(500).json({ error: "Server Error" })
            }
        })


        app.delete("/myAddedPetsDelete/:id", verifyToken, async (req, res) => {
            try {
                await Promise.all([
                    apiHits.updateOne({ api: "/myAddedPetsDelete/:id" }, { $inc: { hitCount: 1 } }),
                    apiHits.updateOne({ api: "allApi" }, { $inc: { hitCount: 1 } })
                ]);
                const email = jwtEmail(req.cookies);
                const id = req.params.id;
                const deleteResult = await petCollection.deleteOne({ email: email, _id: new ObjectId(id) });
                if (deleteResult.deletedCount) {
                    res.status(200).send("Deleted Successfully!")
                }
                else {
                    res.status(404).json({ error: 'Document not found or user not authorized' });
                }
            }
            catch (error) {
                errorCase("/myAddedPetsDelete/:id", req.cookies, error.message);
                return res.status(404).json({ error: "Inorrect Id!" })
            }
        })

        //This api req can only perform the Pet Owner
        app.patch("/adoptedByOthers/:id", verifyToken, async (req, res) => {
            try {
                await Promise.all([
                    apiHits.updateOne({ api: "/adoptedByOthers/:id" }, { $inc: { hitCount: 1 } }),
                    apiHits.updateOne({ api: "allApi" }, { $inc: { hitCount: 1 } })
                ]);
                const email = jwtEmail(req.cookies);
                const id = req.params.id;
                const result = await petCollection.findOne({ email: email, _id: new ObjectId(id) });
                if (result) {
                    if (result.adopted) {
                        res.status(200).json({ error: 'Pet Adopted' });
                    }
                    else {
                        const petAdoptionResult = await petCollection.updateOne({ email: email, _id: new ObjectId(id) }, { $set: { adopted: true } })
                        if (petAdoptionResult.modifiedCount) {
                            res.status(200).send("Pet Adopted Successfully!")
                        }
                        else {
                            res.status(404).json({ error: 'Document not found or user not authorized' });
                        }
                    }

                }
                else {
                    res.status(404).json({ error: 'Document not found or user not authorized!' });
                }
            }
            catch (error) {
                errorCase("/adoptedByOthers/:id", req.cookies, error.message);
                return res.status(404).json({ error: "Inorrect Id!" })
            }
        })


        app.put("/updatePet/:id", verifyToken, async (req, res) => {
            const email = jwtEmail(req.cookies);
            const id = req.params.id;
            const { petImgURL, petName, petAge, petCategory, petLocation, shortDescription, longDescription, time } = req.body;
            // console.log(petImgURL, petName, petAge, petCategory, petLocation, shortDescription, longDescription, time, adopted, email);
            // if (!petImgURL || !petName || !petAge || !petCategory || !petLocation || !shortDescription || !longDescription || !time || !email) {
            //     return res.status(400).send("Bad Request");
            // }
            // else
            {
                try {
                    await Promise.all([
                        apiHits.updateOne({ api: "/updatePet/:id" }, { $inc: { hitCount: 1 } }),
                        apiHits.updateOne({ api: "allApi" }, { $inc: { hitCount: 1 } })
                    ]);
                    const petInfo = { petImgURL, petName, petAge, petCategory, petLocation, shortDescription, longDescription, time, email }
                    const result = await petCollection.updateOne({ email: email, _id: new ObjectId(id) }, { $set: petInfo });
                    if (result.acknowledged) {
                        res.status(201).send("Pet Updated Successfully!");
                    }
                    else {
                        return res.status(500).json({ error: "Internal error occured!" })
                    }
                }
                catch (error) {
                    errorCase("/updatePet/:id", req.cookies, error.message);
                    return res.status(500).json({ error: "Server Error!" })
                }
            }
        })


        app.put("/updatePetAdmin/:id", verifyToken, verifyAdmin, async (req, res) => {
            const email = jwtEmail(req.cookies);
            const id = req.params.id;
            const { petImgURL, petName, petAge, petCategory, petLocation, shortDescription, longDescription, time } = req.body;
            // console.log(petImgURL, petName, petAge, petCategory, petLocation, shortDescription, longDescription, time, adopted, email);
            // if (!petImgURL || !petName || !petAge || !petCategory || !petLocation || !shortDescription || !longDescription || !time || !email) {
            //     return res.status(400).send("Bad Request");
            // }
            // else
            {
                try {
                    await Promise.all([
                        apiHits.updateOne({ api: "/updatePetAdmin/:id" }, { $inc: { hitCount: 1 } }),
                        apiHits.updateOne({ api: "allApi" }, { $inc: { hitCount: 1 } })
                    ]);
                    const petInfo = { petImgURL, petName, petAge, petCategory, petLocation, shortDescription, longDescription, time, email }
                    const result = await petCollection.updateOne({ email: email, _id: new ObjectId(id) }, { $set: petInfo });
                    if (result.acknowledged) {
                        res.status(201).send("Pet Updated Successfully!");
                    }
                    else {
                        return res.status(500).json({ error: "Internal error occured!" })
                    }
                }
                catch (error) {
                    errorCase("/updatePetAdmin/:id", req.cookies, error.message);
                    return res.status(500).json({ error: "Server Error!" })
                }
            }
        })


        app.get("/allUsers", verifyToken, verifyAdmin, async (req, res) => {
            try {
                await Promise.all([
                    apiHits.updateOne({ api: "/allUsers" }, { $inc: { hitCount: 1 } }),
                    apiHits.updateOne({ api: "allApi" }, { $inc: { hitCount: 1 } })
                ]);
                const result = await userCollection.find({}, { projection: { name: 1, email: 1, photoURL: 1, role: 1 } }).toArray();
                res.send(result);
            }
            catch (error) {
                errorCase("/allUsers", req.cookies, error.message);
                res.status(500).send("Internal Server Error!");
            }
        })


        app.get("/allPets", verifyToken, verifyAdmin, async (req, res) => {
            try {
                await Promise.all([
                    apiHits.updateOne({ api: "/allPets" }, { $inc: { hitCount: 1 } }),
                    apiHits.updateOne({ api: "allApi" }, { $inc: { hitCount: 1 } })
                ]);
                const result = await petCollection.find({}, { projection: { petName: 1, petAge: 1, petImgURL: 1, petCategory: 1, adopted: 1 } }).toArray();
                res.send(result);
            }
            catch (error) {
                errorCase("/allPets", req.cookies, error.message);
                res.status(500).send("Internal Server Error!");
            }
        })


        app.delete("/petDelete/:id", verifyToken, verifyAdmin, async (req, res) => {
            try {
                await Promise.all([
                    apiHits.updateOne({ api: "/petDelete/:id" }, { $inc: { hitCount: 1 } }),
                    apiHits.updateOne({ api: "allApi" }, { $inc: { hitCount: 1 } })
                ]);
                const id = req.params.id;
                if (!ObjectId.isValid(id)) {
                    return res.status(400).send("Bad Request: Invalid ID format");
                }
                const result = await petCollection.deleteOne({ _id: new ObjectId(id) });
                if (result?.deletedCount === 1) {
                    res.send("Pet information Deleted successfully!");
                }
                else if (result?.deletedCount === 0) {
                    res.status(404).send("Data Not found!")
                }
                else {
                    res.status(400).send("Bad Request!")
                }
            }
            catch (error) {
                errorCase("/petDelete/:id", req.cookies, error.message);
                res.status(500).send("Internal Server Error!");
            }
        })


        app.patch("/makeAdmin", verifyToken, verifyAdmin, async (req, res) => {
            const { email } = req.body;
            try {
                await Promise.all([
                    apiHits.updateOne({ api: "/makeAdmin" }, { $inc: { hitCount: 1 } }),
                    apiHits.updateOne({ api: "allApi" }, { $inc: { hitCount: 1 } })
                ]);
                const result = await userCollection.updateOne({ email: email }, { $set: { role: "admin" } })
                if (!result.matchedCount) {
                    res.status(404).send("User Not Found!");
                }
                else if (result.acknowledged && result.modifiedCount) {
                    res.status(200).send("Role Updated Successfully!");
                }
                else if (result.acknowledged && !result.modifiedCount) {
                    res.status(200).send("This person are already admin!");
                }
                else {
                    res.status(500).send("Unknown Error Occured!");
                }
            }
            catch (error) {
                errorCase("/makeAdmin", req.cookies, error.message);
                res.status(500).send("Intrnal Server Error");
            }
        })


        app.patch("/petAdoptedByAdmin/:id", verifyToken, verifyAdmin, async (req, res) => {
            try {
                await Promise.all([
                    apiHits.updateOne({ api: "/petAdoptedByAdmin/:id" }, { $inc: { hitCount: 1 } }),
                    apiHits.updateOne({ api: "allApi" }, { $inc: { hitCount: 1 } })
                ]);
                const id = req.params.id;
                const result = await petCollection.updateOne({ _id: new ObjectId(id) }, { $set: { adopted: true } });
                if (result?.matchedCount === 1 && result?.modifiedCount === 1) {
                    res.send("Pet Adopted Successfully!");
                }
                else if (result?.matchedCount === 1 && result?.modifiedCount === 0) {
                    res.status(409).send("Sorry, Pet already adopted!");
                }
                else if (result?.matchedCount === 0) {
                    res.status(404).send("Data not found!")
                }
                else {
                    res.status(500).send("Invalid Query!")
                }
            }
            catch {
                errorCase("/petAdoptedByAdmin/:id", req.cookies, error.message);
                res.status(500).send("Internal Server Error!");
            }
        })


        app.get("/donationCampaigns", verifyToken, verifyAdmin, async (req, res) => {
            try {
                await Promise.all([
                    apiHits.updateOne({ api: "/donationCampaigns" }, { $inc: { hitCount: 1 } }),
                    apiHits.updateOne({ api: "allApi" }, { $inc: { hitCount: 1 } })
                ]);
                const result = await donationCampaingCollection.find({}, { projection: { email: 1, petPicture: 1, maxDonation: 1, ceateTime: 1, lastDateOfDonation: 1, name: 1, paused: 1 } }).toArray();
                res.send(result)
            } catch (error) {
                errorCase("/donationCampaigns", req.cookies, error.message);
                res.status(500).send("Internal Server Error!");
            }
        })


        app.get("/donationCampaignsUsers", async (req, res) => {
            try {
                await Promise.all([
                    apiHits.updateOne({ api: "/donationCampaignsUsers" }, { $inc: { hitCount: 1 } }),
                    apiHits.updateOne({ api: "allApi" }, { $inc: { hitCount: 1 } })
                ]);
                const limit = 6;
                let cursor = null;
                if (req.query.cursor) {
                    try {
                        cursor = new ObjectId(req.query.cursor);
                    } catch (err) {
                        return res.status(400).send("Invalid cursor format");
                    }
                }
                const query = cursor ? { _id: { $gt: cursor } } : {};
                const campaigns = await donationCampaingCollection.find(query, {
                    projection: {
                        email: 1,
                        name: 1,
                        petPicture: 1,
                        maxDonation: 1,
                        createTime: 1,
                        lastDateOfDonation: 1
                    }
                })
                    .sort({ _id: 1 })
                    .limit(limit)
                    .toArray();
                for (let campaign of campaigns) {
                    const donations = await donatorCollection.find({ id: campaign._id }).toArray();
                    let totalDonation = 0;
                    for (let donation of donations) {
                        totalDonation += donation.donationAmount;
                    }
                    campaign.totalDonation = totalDonation;
                }
                const nextCursor = campaigns.length === limit ? campaigns[campaigns.length - 1]._id : null;
                res.json({
                    result: campaigns,
                    nextCursor
                });
            } catch (error) {
                publicErrorCase("/donationCampaignsUsers", error.message);
                res.status(500).send("Internal Server Error!");
            }
        });


        app.get("/donationDetails/:id", async (req, res) => {
            try {
                await Promise.all([
                    apiHits.updateOne({ api: "/donationDetails/:id" }, { $inc: { hitCount: 1 } }),
                    apiHits.updateOne({ api: "allApi" }, { $inc: { hitCount: 1 } })
                ]);
                const id = req.params.id;
                const donationCampaign = await donationCampaingCollection.findOne({ _id: new ObjectId(id) });
                const totalDonationResult = await donatorCollection.aggregate([
                    {
                        $match: { id: new ObjectId(id) }
                    },
                    {
                        $group: {
                            _id: null,
                            totalDonation: { $sum: "$donationAmount" }
                        }
                    }
                ]).toArray();
                const totalDonation = totalDonationResult.length > 0 ? totalDonationResult[0].totalDonation : 0;
                donationCampaign.totalDonation = totalDonation;
                res.send(donationCampaign);
            } catch (error) {
                publicErrorCase("/donationDetails/:id", error.message);
                res.status(500).send("Internal Server Error!");
            }
        })


        app.post("/addDonationCampain", verifyToken, async (req, res) => {
            try {
                await Promise.all([
                    apiHits.updateOne({ api: "/addDonationCampain" }, { $inc: { hitCount: 1 } }),
                    apiHits.updateOne({ api: "allApi" }, { $inc: { hitCount: 1 } })
                ]);

                const email = jwtEmail(req.cookies);
                const { createTime, longDescription, maxDonation, name, petPicture, shortDescription, lastDateOfDonation } = req.body;
                if (!createTime || !longDescription || !maxDonation || !name || !petPicture || !shortDescription || !lastDateOfDonation) {
                    res.send("Fill up the form correctly!")
                }
                else {
                    const donationCampainData = { createTime, longDescription, maxDonation, name, petPicture, shortDescription, email, lastDateOfDonation, paused: false }
                    const result = await donationCampaingCollection.insertOne(donationCampainData);
                    res.send("Donation Campaign added successfully!")
                }

            }
            catch (error) {
                errorCase("/addDonationCampain", req.cookies, error.message);
                res.send("Internal Server Error!");
            }

        })

        app.get("/randomDoanation/:id", async (req, res) => {
            try {
                await Promise.all([
                    apiHits.updateOne({ api: "/randomDoanation/:id" }, { $inc: { hitCount: 1 } }),
                    apiHits.updateOne({ api: "allApi" }, { $inc: { hitCount: 1 } })
                ]);
                const toOmit = req?.params?.id;
                const matchStage = toOmit ? { $match: { _id: { $ne: new ObjectId(toOmit) } } } : {};
                const pipeline = [
                    matchStage,
                    { $sample: { size: 3 } },
                    {
                        $lookup: {
                            from: "donator",
                            localField: "_id",
                            foreignField: "id",
                            as: "donations"
                        }
                    },
                    {
                        $addFields: {
                            totalDonation: { $sum: "$donations.donationAmount" }
                        }
                    },
                    {
                        $project: {
                            email: 1,
                            name: 1,
                            petPicture: 1,
                            maxDonation: 1,
                            ceateTime: 1,
                            lastDateOfDonation: 1,
                            totalDonation: 1
                        }
                    }
                ];
                const results = await donationCampaingCollection.aggregate(pipeline).toArray();
                res.send(results);
            } catch (error) {
                publicErrorCase("/randomDoanation/:id", error.message);
                res.status(500).send("Internal Server Error");
            }
        });


        app.get("/myAchivedDonation", verifyToken, async (req, res) => {
            try {
                const email = jwtEmail(req.cookies);
                await Promise.all([
                    apiHits.updateOne({ api: "/myAchivedDonation" }, { $inc: { hitCount: 1 } }),
                    apiHits.updateOne({ api: "allApi" }, { $inc: { hitCount: 1 } })
                ]);
                const aggregationPipeline = [
                    {
                        $match: {
                            email: email
                        }
                    },
                    {
                        $lookup: {
                            from: "donator",
                            localField: "_id",
                            foreignField: "id",
                            as: "campaignDetails"
                        }
                    },
                    {
                        $unwind: {
                            path: "$campaignDetails",
                            preserveNullAndEmptyArrays: true  // Preserve documents where campaignDetails is null or an empty array
                        }

                    },
                    {
                        $group: {
                            _id: "$_id",
                            totalDonation: { $sum: "$campaignDetails.donationAmount" },
                            maxDonation: { $max: "$campaignDetails.donationAmount" },
                            petName: { $first: "$name" },
                            totalAmountDonationNeed: { $first: "$maxDonation" },
                            paused: { $first: "$paused" }
                        }
                    },
                    {
                        $project: {
                            _id: 0,
                            campaignId: "$_id",
                            totalDonation: 1,
                            maxDonation: 1,
                            petName: 1,
                            totalAmountDonationNeed: 1,
                            paused: 1
                        }
                    }
                ];
                const result = await donationCampaingCollection.aggregate(aggregationPipeline).toArray();
                result.map(result => result.maxDonation ? result.maxDonation = result.maxDonation : result.maxDonation = 0);
                res.send(result);
            } catch (error) {
                errorCase("/myAchivedDonation", req.cookies, error.message);
                res.status(500).send("Internal Server Error");
            }
        });


        app.delete("/donationDelete/:id", verifyToken, verifyAdmin, async (req, res) => {
            try {
                await Promise.all([
                    apiHits.updateOne({ api: "/donationDelete/:id" }, { $inc: { hitCount: 1 } }),
                    apiHits.updateOne({ api: "allApi" }, { $inc: { hitCount: 1 } })
                ]);
                const id = req.params.id;
                if (!ObjectId.isValid(id)) {
                    return res.status(400).send("Invalid ID format");
                }
                const result = await donationCampaingCollection.deleteOne({ _id: new ObjectId(id) });
                if (result?.deletedCount === 1) {
                    res.send("Donation Campaign Deleted!")
                }
                else {
                    res.status(404).send("Donation Campaign Not Found!");
                }
            }
            catch (error) {
                errorCase("/donationDelete/:id", req.cookies, error.message);
                res.status(500).send("Internal Server Error!");
            }
        })

        app.put("/editDonationCampign/:id", verifyToken, async (req, res) => {
            const { petPicture, shortDescription, longDescription, maxDonation, lastDateOfDonation } = req.body;
            try {
                await Promise.all([
                    apiHits.updateOne({ api: "/editDonationCampign/:id" }, { $inc: { hitCount: 1 } }),
                    apiHits.updateOne({ api: "allApi" }, { $inc: { hitCount: 1 } })
                ]);
                const id = req.params.id;
                if (!ObjectId.isValid(id)) {
                    return res.status(400).send("Invalid ID format");
                }
                if (!petPicture || !shortDescription || !longDescription || !maxDonation || !lastDateOfDonation) {
                    res.status(500).send("Please fillup form correctly!");
                }
                else {
                    const result = await donationCampaingCollection.updateOne({ _id: new ObjectId(id) }, { $set: { petPicture, shortDescription, longDescription, maxDonation, lastDateOfDonation, paused: false } });
                    if (result.modifiedCount === 1) {
                        res.status(201).send("Donation Updated Successfully!")
                    } else {
                        res.status(404).send("Data Not Found!");
                    }
                }
            }
            catch (error) {
                errorCase("/editDonationCampign/:id", req.cookies, error.message);
                res.status(504).send("Internal Server error!")
            }
        })


        app.post("/petListing", async (req, res) => {
            try {
                await Promise.all([
                    apiHits.updateOne({ api: "/petListing" }, { $inc: { hitCount: 1 } }),
                    apiHits.updateOne({ api: "allApi" }, { $inc: { hitCount: 1 } })
                ]);
                const { category, title } = req.body;
                const limit = 6;

                let cursor = null;
                if (req.query.cursor) {
                    try {
                        cursor = new ObjectId(req.query.cursor);
                    } catch (err) {
                        return res.status(400).send("Invalid cursor format");
                    }
                }

                // Create regex for title search
                let regex = "";
                if (title) {
                    const searchWord = title.toLowerCase().split(/\s+/).filter(word => word !== "");
                    regex = new RegExp(searchWord.join('|'), 'i');
                }


                // Construct query object
                const query = {
                    adopted: false,
                    ...(cursor && { _id: { $lt: cursor } }),
                    ...(category && { petCategory: category }),
                    ...(regex && { petName: { $regex: regex } })
                };

                // Fetch results from the collection
                const result = await petCollection.find(query, {
                    projection: {
                        petImgURL: 1,
                        petName: 1,
                        petAge: 1,
                        petLocation: 1,
                        time: 1
                    }
                })
                    .sort({ time: -1 })
                    .limit(limit)
                    .toArray();

                // Determine the next cursor
                const nextCursor = result.length === limit ? result[result.length - 1]._id : null;

                // Send the response
                res.json({
                    result,
                    nextCursor
                });
            } catch (error) {
                publicErrorCase("/petListing", error.message);
                res.status(500).send("Internal Server Error");
            }
        })


        app.post("/randomPet/:category", async (req, res) => {
            try {
                await Promise.all([
                    apiHits.updateOne({ api: "/randomPet/:category" }, { $inc: { hitCount: 1 } }),
                    apiHits.updateOne({ api: "allApi" }, { $inc: { hitCount: 1 } })
                ]);
                const toOmit = req?.body?.toOmit;
                const category = req.params.category;
                const pipeline = [
                    {
                        $match: {
                            petCategory: category,
                            ...(toOmit && { _id: { $ne: new ObjectId(toOmit) } }
                            )
                        }
                    },
                    { $sample: { size: 3 } }
                ];
                const results = await petCollection.aggregate(pipeline).toArray();
                res.send(results)
            } catch (error) {
                publicErrorCase("/randomPet/:category", error.message);
                res.status(500).send("Internal Server Error");
            }
        })


        app.get("/petDetails/:id", async (req, res) => {
            const id = req.params.id
            try {
                await Promise.all([
                    apiHits.updateOne({ api: "/petDetails/:id" }, { $inc: { hitCount: 1 } }),
                    apiHits.updateOne({ api: "allApi" }, { $inc: { hitCount: 1 } })
                ]);
                const result = await petCollection.findOne({ _id: new ObjectId(id) });
                res.send(result);
            }
            catch (error) {
                publicErrorCase("/petDetails/:id", error.message);
                res.status(400).send("Invalid Id!")
            }
        })


        app.post("/petAdoptionUser/:id", verifyToken, async (req, res) => {

            try {
                await Promise.all([
                    apiHits.updateOne({ api: "/petAdoptionUser/:id" }, { $inc: { hitCount: 1 } }),
                    apiHits.updateOne({ api: "allApi" }, { $inc: { hitCount: 1 } })
                ]);
                const email = jwtEmail(req.cookies);
                const id = new ObjectId(req.params.id);
                const { petName, petImgURL, name, phoneNumber, address } = req.body;
                if (!petName || !petImgURL || !phoneNumber || !address || !name) {
                    res.status(500).send("Fillup the form correctly!");
                }
                else {
                    const result = await petCollection.findOne({ _id: id });
                    if (!result) {
                        res.status(404).send("Sorry Pet not found!");
                    }
                    else {
                        if (result.adopted) {
                            res.status(409).send("Sorry! This pet is adopted by another person!");
                        }
                        else {
                            const adoptionReqChk = await adoptionReqCollection.findOne({ petId: id, email: email });
                            if (adoptionReqChk) {
                                res.status(200).send("You have aleady send Adoption Request!");
                            }
                            else {
                                const finaltResult = await adoptionReqCollection.insertOne({ petName, petImgURL, name, phoneNumber, address, petId: id, email, adoptionPosterEmail: result.email, accepted: false, rejected: false });
                                if (finaltResult.acknowledged) {
                                    res.status(200).send("Adoption Request sent Successfully!");
                                } else {
                                    res.send("Can't Inserted!")
                                }
                            }

                        }
                    }
                }
            }
            catch (error) {
                errorCase("/petAdoptionUser/:id", req.cookies, error.message);
                res.status(400).send("Invalid Id!");
            }
        })


        app.post("/makeDonationCampign", verifyToken, async (req, res) => {
            try {
                await Promise.all([
                    apiHits.updateOne({ api: "/makeDonationCampign" }, { $inc: { hitCount: 1 } }),
                    apiHits.updateOne({ api: "allApi" }, { $inc: { hitCount: 1 } })
                ]);
                const email = jwtEmail(req.cookies);
                const { name, petPicture, shortDescription, longDescription, maxDonation, lastDateOfDonation, ceateTime } = req.body;
                if (!petPicture || !name || !shortDescription || !longDescription || !maxDonation || !lastDateOfDonation || !ceateTime) {
                    res.status(500).send("Please fillup form correctly!");
                }
                else {
                    const result = await donationCampaingCollection.insertOne({ petPicture, name, shortDescription, longDescription, maxDonation, lastDateOfDonation, ceateTime, email, paused: false });
                    if (result.acknowledged) {
                        res.status(201).send("Donation Ceated Successfully!")
                    }
                }
            }
            catch (error) {
                errorCase("/makeDonationCampign", req.cookies, error.message);
                res.status(504).send("Internal Server error!")
            }
        })


        app.put("/updateDonationCampign/:id", verifyToken, async (req, res) => {
            try {
                await Promise.all([
                    apiHits.updateOne({ api: "/updateDonationCampign/:id" }, { $inc: { hitCount: 1 } }),
                    apiHits.updateOne({ api: "allApi" }, { $inc: { hitCount: 1 } })
                ]);
                const email = jwtEmail(req.cookies);
                const id = req.params.id;
                const { petPicture, shortDescription, longDescription, maxDonation, lastDateOfDonation, ceateTime } = req.body;
                const descition = await donationCampaingCollection.findOne({ _id: new ObjectId(id) });
                if (descition) {
                    if (!petPicture || !shortDescription || !longDescription || !maxDonation || !lastDateOfDonation || !ceateTime) {
                        res.status(500).send("Please fillup form correctly!");
                    }
                    else {
                        const result = await donationCampaingCollection.updateOne({ _id: new ObjectId(id) }, { $set: { petPicture, shortDescription, longDescription, maxDonation, lastDateOfDonation, ceateTime, email, paused: false } });
                        if (result.acknowledged) {
                            res.status(201).send("Donation Updated Successfully!")
                        }
                    }
                }
                else {
                    res.status(401).send("Unauthorize Access")
                }
            }
            catch (error) {
                errorCase("/updateDonationCampign/:id", req.cookies, error.message);
                res.status(504).send("Internal Server error!")
            }
        })


        app.patch("/donationPause/:id", verifyToken, async (req, res) => {
            try {
                await Promise.all([
                    apiHits.updateOne({ api: "/donationPause/:id" }, { $inc: { hitCount: 1 } }),
                    apiHits.updateOne({ api: "allApi" }, { $inc: { hitCount: 1 } })
                ]);
                const email = jwtEmail(req.cookies);
                const id = req.params.id;
                const result = await donationCampaingCollection.findOne({ _id: new ObjectId(id) });
                if (result.paused) {
                    res.status(200).send("Already paused");
                } else {
                    if (result.email === email) {
                        const paused = await donationCampaingCollection.updateOne({ _id: new ObjectId(id) }, { $set: { paused: true } });
                        if (paused.modifiedCount) {
                            res.status(200).send("Paused Successfully!");
                        }
                    }
                    else {
                        res.status(401).send("Unauthorize Access!");
                    }
                }
            }
            catch (error) {
                errorCase("/donationPause/:id", req.cookies, error.message);
                res.status(500).send("Internal Server Error!");
            }
        })


        app.patch("/donationPausebyAdmin/:id", verifyToken, verifyAdmin, async (req, res) => {
            try {
                await Promise.all([
                    apiHits.updateOne({ api: "/donationPausebyAdmin/:id" }, { $inc: { hitCount: 1 } }),
                    apiHits.updateOne({ api: "allApi" }, { $inc: { hitCount: 1 } })
                ]);
                const id = req.params.id;
                const result = await donationCampaingCollection.findOne({ _id: new ObjectId(id) });
                if (result.paused) {
                    res.status(200).send("Already paused");
                } else {
                    const paused = await donationCampaingCollection.updateOne({ _id: new ObjectId(id) }, { $set: { paused: true } });
                    if (paused.modifiedCount) {
                        res.status(200).send("Paused Successfully!");
                    }
                    else {
                        res.status(401).send("Unauthorize Access!");
                    }
                }
            }
            catch (error) {
                errorCase("/donationPausebyAdmin/:id", req.cookies, error.message);
                res.status(500).send("Internal Server Error!");
            }
        })


        app.patch("/donationResume/:id", verifyToken, async (req, res) => {
            try {
                await Promise.all([
                    apiHits.updateOne({ api: "/donationResume/:id" }, { $inc: { hitCount: 1 } }),
                    apiHits.updateOne({ api: "allApi" }, { $inc: { hitCount: 1 } })
                ]);
                const email = jwtEmail(req.cookies);
                const id = req.params.id;
                const result = await donationCampaingCollection.findOne({ _id: new ObjectId(id) });
                if (!result.paused) {
                    res.status(200).send("Already Resumed");
                } else {
                    if (result.email === email) {
                        const paused = await donationCampaingCollection.updateOne({ _id: new ObjectId(id) }, { $set: { paused: false } });
                        if (paused.matchedCount) {
                            res.status(200).send("Resumed Successfully!");
                        }
                    }
                    else {
                        res.status(401).send("Unauthorize Access!");
                    }
                }
            }
            catch (error) {
                errorCase("/donationResume/:id", req.cookies, error.message);
                res.status(500).send("Internal Server Error!");
            }
        })


        app.get("/viewDonator/:id", verifyToken, async (req, res) => {

            try {
                await Promise.all([
                    apiHits.updateOne({ api: "/viewDonator/:id" }, { $inc: { hitCount: 1 } }),
                    apiHits.updateOne({ api: "allApi" }, { $inc: { hitCount: 1 } })
                ]);
                const email = jwtEmail(req.cookies);
                const id = req.params.id;
                const result = await donationCampaingCollection.findOne({ _id: new ObjectId(id) });
                if (result.email === email) {
                    const message = await donatorCollection.find({ id: new ObjectId(id) }, { projection: { name: 1, donationAmount: 1, email: 1 } }).toArray();
                    res.setHeader('Cache-Control', 'no-store').send(message);
                }
                else {
                    errorCase("/rejectAdoptionReq/:id", req.cookies, error.message);
                    res.status(401).send("Unauthorize Access!");
                }
            }
            catch (error) {
                errorCase("/viewDonator/:id", req.cookies, error.message);
                res.status(500).send("Internal Server Error!");
            }
        })


        app.get("/myDonation", verifyToken, async (req, res) => {

            try {
                await Promise.all([
                    apiHits.updateOne({ api: "/myDonation" }, { $inc: { hitCount: 1 } }),
                    apiHits.updateOne({ api: "allApi" }, { $inc: { hitCount: 1 } })
                ]);
                const email = jwtEmail(req.cookies);


                const aggregationPipeline = [
                    {
                        $match: { email: email }
                    },
                    {
                        $lookup: {
                            from: "donationCampaign",
                            localField: "id",
                            foreignField: "_id",
                            as: "myDonation"
                        }
                    },
                    {
                        $unwind: {
                            path: "$myDonation",
                            preserveNullAndEmptyArrays: true
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            name: "$myDonation.name",
                            petPicture: "$myDonation.petPicture",
                            donationAmount: "$donationAmount",
                            trxID: "$trxID",
                        }
                    }
                ]
                const result = await donatorCollection.aggregate(aggregationPipeline).toArray();
                res.send(result);
            }
            catch (error) {
                errorCase("/myDonation", req.cookies, error.message);
                res.status(500).send("Internal Server Error!");
            }
        })


        app.delete("/refundDonation/:id", verifyToken, async (req, res) => {
            try {
                await Promise.all([
                    apiHits.updateOne({ api: "/refundDonation/:id" }, { $inc: { hitCount: 1 } }),
                    apiHits.updateOne({ api: "allApi" }, { $inc: { hitCount: 1 } })
                ]);
                const email = jwtEmail(req.cookies);
                const id = req.params.id;
                const result = await donatorCollection.deleteOne({ _id: new ObjectId(id), email: email });
                if (result.deletedCount) {
                    res.send("Deleted Successfully");
                }
                else {
                    res.status(404).send("User are unauthorize or Data not found!");
                }
            }
            catch (error) {
                errorCase("/refundDonation/:id", req.cookies, error.message);
                res.status(500).send("Internal Server Error!");
            }
        })


        app.get("/allAdoptionReq", verifyToken, async (req, res) => {
            try {
                await Promise.all([
                    apiHits.updateOne({ api: "/allAdoptionReq" }, { $inc: { hitCount: 1 } }),
                    apiHits.updateOne({ api: "allApi" }, { $inc: { hitCount: 1 } })
                ]);
                const email = jwtEmail(req.cookies);

                const pipeline = [
                    {
                        $match: { adoptionPosterEmail: email }
                    },
                    {
                        $lookup: {
                            from: 'allPets',
                            localField: 'petId',
                            foreignField: '_id',
                            as: 'petDetails'
                        }
                    },
                    {
                        $unwind: '$petDetails'
                    },
                    {
                        $project: {
                            petName: 1,
                            petImgURL: 1,
                            name: 1,
                            address: 1,
                            phoneNumber: 1,
                            accepted: 1,
                            rejected: 1,
                            email: 1,
                            petId: 1,
                            adopted: '$petDetails.adopted'
                        }
                    }
                ];
                const result = await adoptionReqCollection.aggregate(pipeline).toArray();
                res.send(result);
            } catch (error) {
                errorCase("/allAdoptionReq", req.cookies, error.message);
                res.status(500).send("Internal Server Error!");
            }
        });


        app.patch("/acceptAdoptionReq/:petId", verifyToken, async (req, res) => {
            {
                try {
                    await Promise.all([
                        apiHits.updateOne({ api: "/acceptAdoptionReq/:petId" }, { $inc: { hitCount: 1 } }),
                        apiHits.updateOne({ api: "allApi" }, { $inc: { hitCount: 1 } })
                    ]);
                    const email = jwtEmail(req.cookies);
                    const id = req.params.petId;
                    const adopterId = req.body.adopterId;
                    if (!ObjectId.isValid(id) || !ObjectId.isValid(adopterId)) {
                        return res.status(400).send("Invalid ID format");
                    }
                    const result = await petCollection.findOne({ _id: new ObjectId(id), email })
                    if (result?.adopted === false) {

                        const updatePetAdoptiation = await petCollection.updateOne({ _id: new ObjectId(id) }, { $set: { adopted: true } });
                        if (updatePetAdoptiation?.acknowledged === true) {
                            const updateAdopterReq = await adoptionReqCollection.updateOne({ _id: new ObjectId(adopterId), adoptionPosterEmail: email, rejected: false }, { $set: { accepted: true } });
                            if (updateAdopterReq?.modifiedCount === 1) {
                                res.send("Adoption Request Accepted!");
                            }
                            else if (updateAdopterReq?.modifiedCount === 0) {
                                adoptionReqCollection.updateOne({ _id: new ObjectId(adopterId) }, { $set: { accepted: false } })
                                await petCollection.updateOne({ _id: new ObjectId(id) }, { $set: { adopted: false } })
                                res.status(400).send("Bad Request");
                            }
                        }
                        else {
                            res.status(500).send("Failed to update pet adoption status");
                        }
                    }
                    else if (result?.rejected === true) {
                        res.status(409).send("You already rejected this person for adopting this pet");
                    }
                    else {
                        res.status(404).send("Unauthorise access or Data not found!")
                    }
                }
                catch (error) {
                    errorCase("/acceptAdoptionReq/:petId", req.cookies, error.message);
                    res.status(500).send("Internal Server Error!");
                }
            }
        })


        app.patch("/rejectAdoptionReq/:id", verifyToken, async (req, res) => {
            try {
                await Promise.all([
                    apiHits.updateOne({ api: "/rejectAdoptionReq/:id" }, { $inc: { hitCount: 1 } }),
                    apiHits.updateOne({ api: "allApi" }, { $inc: { hitCount: 1 } })
                ]);
                const email = jwtEmail(req.cookies);
                const id = req.params.id;
                if (!ObjectId.isValid(id)) {
                    return res.status(400).send("Invalid ID format");
                }
                const result = await adoptionReqCollection.findOne({ _id: new ObjectId(id) });
                if (result?.accepted === true) {
                    res.status(409).send("You have already accepted this adoption request!");
                }
                else if (result?.rejected === false) {
                    const updating = await adoptionReqCollection.updateOne({ adoptionPosterEmail: email, _id: new ObjectId(id) }, { $set: { rejected: true } });
                    if (updating?.modifiedCount === 1) {
                        res.send("Adoption request rejected Successfully!");
                    }
                    else {
                        res.status(401).send("Unauthorize access!")
                    }
                }
                else {
                    res.status(400).send("Bad Request");
                }
            } catch (error) {
                errorCase("/rejectAdoptionReq/:id", req.cookies, error.message);
                res.status(500).send("Internal Server Error!");
            }
        })


        app.get('/systemInfo', verifyToken, verifyAdmin, async (req, res) => {
            try {
                const totalMemory = os.totalmem();
                const freeMemory = os.freemem();
                const usedMemory = totalMemory - freeMemory;
                const cpus = os.cpus();
                const totalCores = cpus.length;
                const uptime = os.uptime();
                const platform = os.platform();
                const cpuUsage = await cpu.usage()
                const arch = os.arch();
                res.json({
                    totalMemory: totalMemory / (1024 * 1024),
                    freeMemory: freeMemory / (1024 * 1024),
                    usedMemory: usedMemory / (1024 * 1024),
                    totalCores: totalCores,
                    cpuUsage,
                    uptime: uptime,
                    platform: platform,
                    architecture: arch
                })
            }
            catch (error) {
                res.send("Internal server Error!");
            }
        })

        app.get("/apiHit", verifyToken, verifyAdmin, async (req, res) => {
            try {
                const result = await apiHits.find({}).toArray();
                res.send(result)
            }
            catch (error) {
                res.status(500).send("Internal Server Error!");
            }
        })


        app.get("/errorReport", verifyToken, verifyAdmin, async (req, res) => {
            try {
                const result = await apiError.find({}).toArray();
                res.send(result)
            }
            catch (error) {
                res.status(500).send("Internal Server Error!");
            }
        })


        app.post("/giveDonation/:id", verifyToken, async (req, res) => {
            const id = req.params.id;
            const email = jwtEmail(req.cookies);
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const data = {
                email: user?.email,
                name: user?.name,
                trxID: "BFG345435435",
                contactNumber: req.body?.phoneNumber,
                id: new ObjectId(id),
                donationAmount: parseInt(req.body?.donationAmount),
            }
            const result = await donatorCollection.insertOne(data);
            res.send("Donated Successfully");
        })


    }
    catch (error) {
        console.log(error);
    }
    finally { }
}


run().catch(console.dir);

app.listen(port, () => {
    console.log(`Pet is playing on port ${port}`);
})