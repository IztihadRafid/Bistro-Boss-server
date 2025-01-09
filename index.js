const express = require('express')
const cors = require("cors")
const app = express()
require("dotenv").config();
const stripe= require('stripe')(process.env.STRIPE_SECRET_KEY)
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 5000


//middleware
app.use(cors())
app.use(express.json())



const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.1rbhjut.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;


// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();


        //ALL database collections
        const menuCollection = client.db("bistroDb").collection("menu");
        const reviewCollection = client.db("bistroDb").collection("reviews");
        const cartCollection = client.db("bistroDb").collection("carts")
        const userCollection = client.db("bistroDb").collection('users');
        const paymentCollection = client.db("bistroDb").collection('payments');

        //JWT related Api
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "6h" });
            res.send({ token })
        })

        //user realted API
        app.post('/users', async (req, res) => {
            const user = req.body;

            //Checking if user is Exist or not
            const query = { email: user.email };
            const existingUser = await userCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: "User Already Exists", insertedId: null })
            }

            //adding new user
            const result = await userCollection.insertOne(user)
            res.send(result)
        })

        //middlewares
        const verifyToken = (req, res, next) => {
            console.log("inside verify Token", req.headers.authorization);
            if (!req.headers.authorization) {
                return res.status(401).send({ message: "Unauthorized Access" })
            }
            const token = req.headers.authorization.split(" ")[1];
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: "UnAuthorized Access" })
                }
                req.decoded = decoded;
                next()
            })
            // next()
        }

        //use verify admin after verifyToken
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email }
            const user = await userCollection.findOne(query);
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ message: "Forbidden Access" })
            }
            next()
        }


        //All users
        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result)
        })

        //admin api call using token verification by email
        app.get('/users/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email;

            if (email !== req.decoded.email) {
                return res.status(403).send({ message: "Forbidden access" })
            }
            const query = { email: email };
            const user = await userCollection.findOne(query);
            let admin = false;
            if (user) {
                admin = user?.role === 'admin';
            }
            res.send({ admin })
        })


        app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await userCollection.updateOne(filter, updatedDoc)
            res.send(result)
        })


        //From Admin deletion user 
        app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await userCollection.deleteOne(query);
            res.send(result)
        })

        //Getting ALL menu items
        app.get("/menu", async (req, res) => {
            const result = await menuCollection.find().toArray();
            res.send(result);
        })


        //Adding Food item by Admin
        app.post("/menu", verifyToken,verifyAdmin,async (req, res) => {
            const item = req.body;
            const result = await menuCollection.insertOne(item);
            res.send(result)
        })

        //Deleting food Item By Admin
        app.delete("/menu/:id",verifyToken,verifyAdmin,async(req,res)=>{
            const id = req.params.id;
            const query = {_id: new ObjectId(id)}
            const result = await menuCollection.deleteOne(query);
            res.send(result)
        })

        //Update Food item by Admin
        app.get("/menu/:id",async(req,res)=>{
            const id = req.params.id;
            const query = {_id: new ObjectId(id)}
            const result = await menuCollection.findOne(query);
            res.send(result)
        })

        app.patch('/menu/:id',async(req,res)=>{
            const item = req.body;
            const id = req.params.id;
            const filter = {_id: new ObjectId(id)}
            const updatedDoc = {
                $set:{
                    name: item.name,
                    category: item.category,
                    price: item.price,
                    recipe: item.recipe,
                    image: item.image
                }
            }
            const result = await menuCollection.updateOne(filter,updatedDoc)
            res.send(result)
        })


        //Reviews Testimonials
        app.get("/reviews", async (req, res) => {
            const result = await reviewCollection.find().toArray();
            res.send(result);
        })

        // getting Cart from db and to client
        app.get('/carts', async (req, res) => {
            const email = req.query.email;
            const query = { email: email }
            const result = await cartCollection.find(query).toArray();
            res.send(result)
        })


        //carts Collections posting to db
        app.post("/carts", async (req, res) => {
            const cartItem = req.body;
            const result = await cartCollection.insertOne(cartItem);
            res.send(result)
        })



        //delete cart from dashboard user
        app.delete('/carts/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await cartCollection.deleteOne(query);
            res.send(result)
        })


        //Payment Histroy
        app.get('/payments/:email',verifyToken,async(req,res)=>{
            const query = {email: req.params.email}
            if(req.params.email !==req.decoded.email){
                return res.status(403).send({message: 'forbidden access'});
            }
            const result = await paymentCollection.find(query).toArray();
            res.send(result)
        })



        //Payment INtent
        app.post("/create-payment-intent",async(req,res)=>{
            const {price} = req.body;
            const amount = parseInt(price*100)
            const paymentIntent = await stripe.paymentIntents.create({
                amount:amount,
                currency: "usd",
                payment_method_types: ['card']
            });
            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })
        //Payment realted API
        app.post('/payments',async(req,res)=>{
            const payment = req.body;
            const paymentResult = await paymentCollection.insertOne(payment)

            //delete each item from the cart
            console.log("payment info: ",payment);
            const query = {_id:{
                $in: payment.cartIds.map(id=> new ObjectId(id))
            }}
            const deleteResult = await cartCollection.deleteMany(query);

            res.send({paymentResult,deleteResult}) 
        })
        
        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);





app.get('/', (req, res) => {
    res.send('Bistro Boss is ACTIVE')
})

app.listen(port, () => {
    console.log(`Bistro Boss is running on ${port}`)
})