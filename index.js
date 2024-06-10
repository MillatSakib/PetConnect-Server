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

            const error = new Error('Unauthorized Access1');
            return res.status(401).json({ error: error.message });
        }
        const token = req.cookies.token;
        console.log(req.cookies);
        jwt.verify(token, process.env.Access_Token_Secret, (err, decoded) => {
            if (err) {
                console.log(err);
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
        const adoptionReqCollection = client.db("petAdoption").collection("adoptionReq");
        const donationCampaingCollection = client.db("petAdoption").collection("donationCampaign");
        const donatorCollection = client.db("petAdoption").collection('donator');

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
            console.log(isAdmin);
            if (!isAdmin) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            next();
        }


        //Here All Kind of Corner Case Handeled
        app.post("/userSign", async (req, res) => {
            const info = req.body;
            if (!info.displayName || !info.uid || !info.email || !info.photoURL) {
                return res.send("Forbidden Access!")
            }
            else {
                const insertInfo = {
                    name: info.name,
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
                        const token = jwt.sign({ email: info.email }, process.env.Access_Token_Secret, { expiresIn: '720h' });
                        res.cookie('token', token, cookieOptions).send({ success: true })
                    } else {
                        const error = new Error('Unauthorized Access');
                        return res.status(500).json({ error: error.message });
                    }
                }
                else if (!result && pesult) {
                    const error = new Error('Unauthorized Access');
                    return res.status(500).json({ error: error.message });
                }
                else {
                    if (info.email === result.email) {
                        const token = jwt.sign({ email: info.email }, process.env.Access_Token_Secret, { expiresIn: '720h' });
                        return res.cookie('token', token, cookieOptions).send({ success: true })
                    }
                    else {
                        const error = new Error('Unauthorized Access');
                        return res.status(500).json({ error: error.message });
                    }
                }
            }
        })


        app.get("/verifyAdmin", verifyToken, verifyAdmin, (req, res) => {
            res.send({ message: "have access" })
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
                const result = await petCollection.find({ email: email }, { projection: { petName: 1, petCategory: 1, adopted: 1, petImgURL: 1 } }).toArray();
                res.status(200).send(result)
            }
            catch (error) {
                console.log("Got Error", error);
                return res.status(500).json({ error: "Server Error" })
            }
        })


        app.delete("/myAddedPetsDelete/:id", verifyToken, async (req, res) => {
            const email = jwtEmail(req.cookies);
            try {
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
                console.log("Error Occured: ", error);
                return res.status(404).json({ error: "Inorrect Id!" })
            }
        })

        //This api req can only perform the Pet Owner
        app.patch("/adoptedByOthers/:id", verifyToken, async (req, res) => {
            const email = jwtEmail(req.cookies);
            try {
                const id = req.params.id;
                const result = await petCollection.findOne({ email: email, _id: new ObjectId(id) });
                if (result) {
                    if (result.adopted) {
                        res.status(200).json({ error: 'Pet Adopted' });
                    }
                    else {
                        const petAdoptionResult = await petCollection.updateOne({ email: email, _id: new ObjectId(id) }, { $set: { adopted: true } })
                        console.log(petAdoptionResult);
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
                console.log("Error Occured: ", error);
                return res.status(404).json({ error: "Inorrect Id!" })
            }
        })


        app.put("/updatePet/:id", verifyToken, async (req, res) => {
            const email = jwtEmail(req.cookies);
            const id = req.params.id;
            console.log(req.body);
            const { petImgURL, petName, petAge, petCategory, petLocation, shortDescription, longDescription, time } = req.body;
            // console.log(petImgURL, petName, petAge, petCategory, petLocation, shortDescription, longDescription, time, adopted, email);
            // if (!petImgURL || !petName || !petAge || !petCategory || !petLocation || !shortDescription || !longDescription || !time || !email) {
            //     return res.status(400).send("Bad Request");
            // }
            // else
            {
                try {
                    const petInfo = { petImgURL, petName, petAge, petCategory, petLocation, shortDescription, longDescription, time, email }
                    console.log(petInfo);
                    const result = await petCollection.updateOne({ email: email, _id: new ObjectId(id) }, { $set: petInfo });
                    if (result.acknowledged) {
                        res.status(201).send("Pet Updated Successfully!");
                    }
                    else {
                        return res.status(500).json({ error: "Internal error occured!" })
                    }
                }
                catch (error) {
                    console.log("Got Error", error);
                    return res.status(500).json({ error: "Server Error!" })
                }
            }
        })


        app.get("/allUsers", verifyToken, verifyAdmin, async (req, res) => {
            try {
                const result = await userCollection.find({}, { projection: { name: 1, email: 1, photoURL: 1 } }).toArray();
                res.send(result);
            }
            catch (error) {
                res.status(500).send("Internal Server Error!");
            }
        })


        app.get("/allPets", verifyToken, verifyAdmin, async (req, res) => {
            try {
                const result = await petCollection.find({}, { projection: { petName: 1, petAge: 1, petImgURL: 1, petCategory: 1 } }).toArray();
                res.send(result);
            }
            catch (error) {
                res.status(500).send("Internal Server Error!");
            }
        })


        app.delete("/petDelete/:id", verifyToken, verifyAdmin, async (req, res) => {
            try {
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
                res.status(500).send("Internal Server Error!");
            }
        })


        app.patch("/makeAdmin", verifyToken, verifyAdmin, async (req, res) => {
            const { email } = req.body;

            try {
                const result = await userCollection.updateOne({ email: email }, { $set: { role: "admin" } })
                console.log(result);
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
                res.status(500).send("Intrnal Server Error");
            }
        })


        app.patch("/petAdoptedByAdmin/:id", verifyToken, verifyAdmin, async (req, res) => {
            try {
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
                res.status(500).send("Internal Server Error!");
            }
        })


        app.get("/donationCampaigns", verifyToken, verifyAdmin, async (req, res) => {
            try {
                const result = await donationCampaingCollection.find({}, { projection: { email: 1, petPicture: 1, maxDonation: 1, ceateTime: 1, lastDateOfDonation: 1 } }).toArray();
                res.send(result)
            } catch (error) {
                res.status(500).send("Internal Server Error!");
            }
        })

        app.get("/donationCampaignsUsers", async (req, res) => {
            try {
                const campaigns = await donationCampaingCollection.find({}, { projection: { email: 1, name: 1, petPicture: 1, maxDonation: 1, ceateTime: 1, lastDateOfDonation: 1 } }).toArray();
                for (let campaign of campaigns) {
                    const donations = await donatorCollection.find({ id: campaign._id }).toArray();
                    let totalDonation = 0;
                    for (let donation of donations) {
                        totalDonation += donation.donationAmount;
                    }
                    campaign.totalDonation = totalDonation;
                }

                res.send(campaigns);
            } catch (error) {
                res.status(500).send("Internal Server Error!");
            }
        });


        app.get("/donationDetails/:id", async (req, res) => {
            try {
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
                res.status(500).send("Internal Server Error!");
            }
        })


        app.post("/addDonationCampain", verifyToken, async (req, res) => {
            const email = jwtEmail(req.cookies);
            const { ceateTime, longDescription, maxDonation, name, petPicture, shortDescription, lastDateOfDonation } = req.body;
            const donationCampainData = { ceateTime, longDescription, maxDonation, name, petPicture, shortDescription, email, lastDateOfDonation, paused: false }
            const result = await donationCampaingCollection.insertOne(donationCampainData);
            res.send("Donation Campain added successfully!")
        })

        app.get("/randomDoanation", async (req, res) => {
            try {
                const pipeline = [
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
                res.status(500).send("Internal Server Error");
            }
        });



        app.get("/myAchivedDonation", verifyToken, async (req, res) => {
            try {
                const email = jwtEmail(req.cookies);
                const aggregationPipeline = [
                    {
                        $lookup: {
                            from: "donationCampaign",
                            localField: "id",
                            foreignField: "_id",
                            as: "campaignDetails"
                        }
                    },
                    {
                        $unwind: "$campaignDetails"
                    },
                    {
                        $match: {
                            email: email,
                        }
                    },
                    {
                        $group: {
                            _id: "$campaignDetails._id",
                            totalDonation: { $sum: "$donationAmount" },
                            maxDonation: { $max: "$donationAmount" },
                            petName: { $first: "$campaignDetails.name" }
                        }
                    },
                    {
                        $project: {
                            _id: 0,
                            campaignId: "$_id",
                            totalDonation: 1,
                            maxDonation: 1,
                            petName: 1
                        }
                    }
                ];
                const result = await donatorCollection.aggregate(aggregationPipeline).toArray();
                res.send(result);
            } catch (error) {
                console.error(error);
                res.status(500).send("Internal Server Error");
            }
        });


        app.get("/donationDelete/:id", verifyToken, verifyAdmin, async (req, res) => {
            try {
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
                res.status(500).send("Internal Server Error!");
            }
        })

        app.put("/editDonationCampign/:id", verifyToken, verifyAdmin, async (req, res) => {
            const { petPicture, shortDescription, longDescription, maxDonation, lastDateOfDonation, ceateTime } = req.body;
            try {
                const id = req.params.id;
                if (!ObjectId.isValid(id)) {
                    return res.status(400).send("Invalid ID format");
                }
                if (!petPicture || !shortDescription || !longDescription || !maxDonation || !lastDateOfDonation || !ceateTime) {
                    res.status(500).send("Please fillup form correctly!");
                }
                else {
                    const result = await donationCampaingCollection.updateOne({ _id: new ObjectId(id) }, { $set: { petPicture, shortDescription, longDescription, maxDonation, lastDateOfDonation, ceateTime, paused: false } });
                    if (result.modifiedCount === 1) {
                        res.status(201).send("Donation Updated Successfully!")
                    } else {
                        res.status(404).send("Data Not Found!");
                    }
                }
            }
            catch (error) {
                console.log(error);
                res.status(504).send("Internal Server error!")
            }
        })


        app.post("/petListing", async (req, res) => {
            const { timeValue } = req.body;
            const { category } = req.body;
            const { title } = req.body;
            let regex;
            if (title) {
                const searchWord = title.toLowerCase().split(/\s+/);
                regex = new RegExp(searchWord.join('|'), 'i');
            } else {
                regex = "";
            }
            const query = { adopted: false, time: { $lt: timeValue }, ...(category ? { petCategory: category } : {}), ...(regex ? { petName: { $regex: regex } } : {}) }
            try {
                if (timeValue) {
                    const result = await petCollection.find(query, { projection: { petImgURL: 1, petName: 1, petAge: 1, petLocation: 1, time: 1 } }).sort({ time: -1 }).toArray();
                    res.send(result)
                }
                else {
                    res.status(400).send("Please request correctly!");
                }

            }
            catch (error) {
                console.log(error);
                res.status(500).send("Intrnal Server Error");
            }

        })


        app.get("/randomPet/:category", async (req, res) => {
            try {
                const category = req.params.category;
                const pipeline = [
                    { $match: { petCategory: category } },
                    { $sample: { size: 3 } }
                ];
                const results = await petCollection.aggregate(pipeline).toArray();
                res.send(results)
            } catch (error) {
                res.status(500).send("Intrnal Server Error");
            }


        })


        app.get("/petDetails/:id", async (req, res) => {
            const id = req.params.id
            try {
                const result = await petCollection.findOne({ _id: new ObjectId(id) });
                res.send(result);
            }
            catch (error) {
                res.status(400).send("Invalid Id!")
            }
        })


        app.post("/petAdoptionUser/:id", verifyToken, async (req, res) => {
            const email = jwtEmail(req.cookies);
            const id = req.params.id;
            const { petName, petImgURL, name, phoneNumber, address } = req.body;
            try {
                // const result = awiat petCollection.findOne({ _id: new ObjectId(id) })
                if (!petName || !petImgURL || !phoneNumber || !address || !name) {
                    console.log(petName, petImgURL, name, phoneNumber, address);
                    res.status(500).send("Fillup the form correctly!");
                }
                else {
                    const result = await petCollection.findOne({ _id: new ObjectId(id) });
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
                res.status(400).send("Invalid Id!");
            }
        })


        app.post("/makeDonationCampign", verifyToken, async (req, res) => {
            const email = jwtEmail(req.cookies);
            const { name, petPicture, shortDescription, longDescription, maxDonation, lastDateOfDonation, ceateTime } = req.body;
            try {
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
                res.status(504).send("Internal Server error!")
            }
        })


        app.put("/updateDonationCampign/:id", verifyToken, async (req, res) => {
            const email = jwtEmail(req.cookies);
            const id = req.params.id;
            const { petPicture, shortDescription, longDescription, maxDonation, lastDateOfDonation, ceateTime } = req.body;
            try {
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
                console.log(error);
                res.status(504).send("Internal Server error!")
            }
        })


        app.patch("/donationPause/:id", verifyToken, async (req, res) => {
            try {
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
                console.log(error);
                res.status(500).send("Internal Server Error!");
            }
        })

        app.get("/viewDonator/:id", verifyToken, async (req, res) => {

            try {
                const email = jwtEmail(req.cookies);
                const id = req.params.id;
                const result = await donationCampaingCollection.findOne({ _id: new ObjectId(id) });
                if (result.email === email) {
                    const message = await donatorCollection.find({ id: new ObjectId(id) }, { projection: { name: 1, donationAmount: 1 } }).toArray();
                    res.send(message);
                }
                else {
                    res.status(401).send("Unauthorize Access!");
                }
            }
            catch (error) {
                res.status(500).send("Internal Server Error!");
            }
        })


        app.get("/myDonation", verifyToken, async (req, res) => {

            try {
                const email = jwtEmail(req.cookies);
                const result = await donatorCollection.find({ donationCampainerEmail: email }, { projection: {} }).toArray();
                res.send(result);
            }
            catch (error) {
                res.status(500).send("Internal Server Error!");
            }
        })

        app.delete("/refundDonation/:id", verifyToken, async (req, res) => {
            try {
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
                console.log(error);
                res.status(500).send("Internal Server Error!");
            }
        })

        app.get("/allAdoptionReq", verifyToken, async (req, res) => {
            try {
                const email = jwtEmail(req.cookies);
                const result = await adoptionReqCollection.find({ adoptionPosterEmail: email }, { projection: { petName: 1, petImgURL: 1, name: 1, address: 1, phoneNumber: 1, accepted: 1, rejected: 1, email: 1, petId: 1 } }).toArray();
                res.send(result)
            } catch (error) {
                res.status(500).send("Internal Server Error!");
            }
        })


        app.patch("/acceptAdoptionReq/:petId", verifyToken, async (req, res) => {
            {
                try {
                    const email = jwtEmail(req.cookies);
                    const id = req.params.petId;
                    const adopterId = req.body.adopterId;
                    if (!ObjectId.isValid(id) || !ObjectId.isValid(adopterId)) {
                        return res.status(400).send("Invalid ID format");
                    }
                    const result = await petCollection.findOne({ _id: new ObjectId(id), email: email })
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
                    else if (result?.adopted === true) {
                        res.status(409).send("This pet has already been adopted");
                    }
                    else {
                        res.status(404).send("Unauthorise access or Data not found!")
                    }
                }
                catch (error) {
                    res.status(500).send("Internal Server Error!");
                }
            }
        })


        app.patch("/rejectAdoptionReq/:id", verifyToken, async (req, res) => {
            try {
                const email = jwtEmail(req.cookies);
                const id = req.params.id;
                if (!ObjectId.isValid(id)) {
                    return res.status(400).send("Invalid ID format");
                }
                const result = await adoptionReqCollection.findOne({ _id: new ObjectId(id) });
                if (result?.rejected === true) {
                    res.status(409).send("You have already rejected this adoption request!");
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
                console.log(error);
                res.status(500).send("Internal Server Error!");
            }
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