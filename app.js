const express = require("express");
const path = require("path");
const { MongoClient } = require("mongodb");
const { ObjectId } = require("mongodb");
const session = require("express-session");


const url = "mongodb://localhost:27017";
const dbName = "FoodDeliveryDB";
const client = new MongoClient(url);

const app = express();
const publicDirectoryPath = path.join(__dirname, "./public");

app.use(
  session({
    secret: "SureCharanReddy",
    resave: false,
    saveUninitialized: true,
  })
);

// Set up view engine and static files
app.use(express.static(publicDirectoryPath));
app.set("view engine", "hbs");

// Middleware to parse form data
app.use(express.urlencoded({ extended: true }));

let db;

// Connect to MongoDB once at the start
async function connectToDatabase() {
  try {
    await client.connect();
    db = client.db(dbName);
    console.log("Connected to MongoDB");
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error);
  }
}
connectToDatabase();



// ----------------------------REGISTER------------------------------//



// Serve the registration page
app.get("/register", (req, res) => {
  res.render("register");
});


// Handle registration form submission
app.post("/submit", async (req, res) => {
  try {
    const { 
            name,
            email,
            phone,
            password,
            street,
            city,
            state,
            pincode,
            role 
          } = req.body;

    const user = {
      name,
      email,
      phone,
      password,
      address: { street, city, state, Pincode: pincode },
      role,
    };

    await db.collection("Users").insertOne(user);
    res.render("register-sucessfull")
  } catch (error) {
    console.error("Error saving user data:", error);
    res.status(500).send("Error registering user: " + error.message);
  }
});



// ----------------------------LOGIN-----------------------------//



// Serve the login page
app.get("/login", (req, res) => {
  res.render("login");
});


// Handle login form submission
app.post("/login", async (req, res) => {
  const { identifier, password } = req.body;
  try {
    // Find the user by email or phone
    const user = await db.collection("Users").findOne({
      $or: [{ email: identifier }, { phone: identifier }],
    });

    // Check if user exists and password is correct
    if (user && user.password === password) {
      if (user.role === "customer") {
        res.redirect(`/customer-home?id=${user._id}`);
      } else if (user.role === "restaurant_owner") {
        res.redirect(`/restaurant-owner-home?id=${user._id}`);
      } else if (user.role === "delivery_person") {
        res.redirect(`/driver-home?id=${user._id}`);
      }
    } else {
      res.send("Invalid email/phone number or password");
    }
  } catch (error) {
    console.error("Error logging in:", error);
    res.status(500).send("Error logging in: " + error.message);
  }
});



// ----------------------------CUSTOMER-----------------------------//



// Customer home page
app.get("/customer-home", async (req, res) => {
  try {
    const customerId = req.query.id; // Customer ID from query params

    if (!customerId) {
      return res.status(400).send("Missing customer ID in the request.");
    }

    const customer = await db
      .collection("Users")
      .findOne({ _id: new ObjectId(customerId) });

    if (!customer) {
      return res.status(404).send("Customer not found.");
    }

    const restaurants = await db.collection("Restaurants").find({}).toArray();

    res.render("customer-home", {
      customerName: customer.name,
      customerId,
      restaurants,
    });
  } catch (error) {
    console.error("Error fetching customer details:", error);
    res.status(500).send("An error occurred");
  }
});


// view menu page
app.get("/menu", async (req, res) => {
  try {
    const restaurantId = req.query.restaurantId;
    const customerId = req.query.customerId;

    if (!restaurantId) {
      return res.status(400).send("Missing restaurant ID in the request.");
    }

    if (!customerId) {
      return res.status(400).send("Missing customer ID in the request.");
    }

    const restaurant = await db
      .collection("Restaurants")
      .findOne({ _id: new ObjectId(restaurantId) });
    if (!restaurant) {
      return res.status(404).send("restaurant not found.");
    }

    const menu = await db
      .collection("Menu")
      .find({ restaurantId: restaurantId })
      .toArray();

    res.render("menu", {
      menu,
      restaurantId,
      customerId,
      restaurant,
    });
  } catch (error) {
    console.error("Error fetching customer details:", error);
    res.status(500).send("An error occurred");
  }
});


// add menu to cart
app.post("/menu", (req, res) => {
  const { customerId, restaurantId, menuId, item, price } = req.body;

  if (!menuId || !item || !price) {
    return res.status(400).send("Invalid cart item details.");
  }

  // Initialize the cart in the session if it does not exist
  if (!req.session.cart) {
    req.session.cart = [];
  }

  // Check if the item is already in the cart
  const existingItem = req.session.cart.find(
    (cartItem) => cartItem.menuId === menuId
  );

  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    req.session.cart.push({
      menuId,
      restaurantId,
      item,
      price: parseFloat(price),
      quantity: 1,
    });
  }
  res.redirect(`/menu?customerId=${customerId}&restaurantId=${restaurantId}`);
});


// view cart page
app.get("/view-cart", (req, res) => {
  const customerId = req.query.customerId;

  const cart = req.session.cart || [];
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const restaurantId = cart.length > 0 ? cart[0].restaurantId : null;

  //console.log(restaurantId)

  res.render("view-cart", { cart, total, customerId, restaurantId });
});


// view order page
app.get("/order", (req, res) => {
  const customerId = req.query.customerId;
  res.render("order", {
    customerId,
  });
});


// store orders in db
app.post("/order", async (req, res) => {
  let { customerId, restaurantId } = req.body;
  if (!customerId || !restaurantId) {
    return res.status(400).send("Missing parameters in the request.");
  }

  const customer = await db
    .collection("Users")
    .findOne({ _id: new ObjectId(customerId) });
  if (!customer) {
    return res.status(400).send("No customer found");
  }

  const restaurant = await db
    .collection("Restaurants")
    .findOne({ _id: new ObjectId(restaurantId) });
  if (!restaurant) {
    return res.status(400).send("No Restaurant found");
  }

  const cart = req.session.cart || [];
  if (cart.length === 0) {
    return res.status(400).send("cart is empty. cannot place order");
  }
  const order = {
    customerId,
    customerName: customer.name,
    restaurantId,
    restaurantName: restaurant.name,
    items: cart.map((item) => ({
      menuId: item.menuId,
      name: item.item,
      price: item.price,
      quantity: item.quantity,
    })),
    total: cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    createdAt: new Date(),
  };
  try {
    await db.collection("Orders").insertOne(order);
    req.session.cart = [];
    res.redirect(`/order?customerId=${customerId}`);
  } catch (error) {
    console.error("Error placing order:", error);
    res.status(500).send("Failed to place the order. Please try again.");
  }
});


// customer order history
app.get("/order-history", async (req, res) => {

  const customerId = req.query.id;
  if (!customerId) {
    return res.status(400).send("Missing parameters in the request.");
  }

  const orders = await db
    .collection("Orders")
    .find({ customerId: customerId })
    .toArray();

  const orderHistory = orders || [];

  res.render("order-history", {
    customerId,
    orders: orderHistory,
  });
});


// ----------------------------RESTAURANT-----------------------------//


// Restaurant owner home page
app.get("/restaurant-owner-home", async (req, res) => {
  try {
    const restaurantOwnerId = req.query.id;
    const restaurant = await db
      .collection("Restaurants")
      .findOne({ ownerId: restaurantOwnerId });

    res.render("restaurant-owner-home", {
      isRegistered: !!restaurant,
      ownerId: restaurantOwnerId,
      restaurantId: restaurant ? restaurant._id : null,
    });
  } catch (error) {
    console.error("Error fetching restaurant details:", error);
    res.status(500).send("An error occurred");
  }
});


// serve restaurant details page
app.get("/add-details", (req, res) => {
  const ownerId = req.query.ownerId; 
  if (!ownerId) {
    return res.status(400).send("Missing ownerId in the request.");
  }
  res.render("add-details", { ownerId }); 
});


// Add restaurant details to db
app.post("/add-details", async (req, res) => {
  try {
    const { ownerId, name, area, city, state, pincode, contact, rating } =
      req.body;

    const restaurant = {
      ownerId,
      name,
      address: { area, city, state, pincode },
      contact,
      rating,
    };

    await db.collection("Restaurants").insertOne(restaurant);

    res.send("Restaurant added successfully!");
  } catch (error) {
    console.error("Error saving restaurant data:", error);
    res.status(500).send("Error registering restaurant: " + error.message);
  }
});


// serve view menu page
app.get("/view-menu", async (req, res) => {
  const restaurantOwnerId = req.query.ownerId;
  const restaurantId = req.query.restaurantId;

  if (!restaurantOwnerId || !restaurantId) {
    return res.status(400).send("Missing parameters in the request.");
  }

  const restaurant = await db
    .collection("Restaurants")
    .findOne({ _id: new ObjectId(restaurantId) });

  if (!restaurant) {
    return res.status(404).send("Restaurant not found.");
  }

  const menu = await db
    .collection("Menu")
    .find({ restaurantId: restaurantId })
    .toArray();

  res.render("view-menu", {
    menu,
    restaurant,
    ownerId: restaurantOwnerId,
  });
});


// serve add items page
app.get("/add-items", async (req, res) => {
  try {
    const restaurantOwnerId = req.query.ownerId;
    const restaurantId = req.query.restaurantId;

    if (!restaurantOwnerId || !restaurantId) {
      return res.status(400).send("Missing parameters in the request.");
    }

    const restaurant = await db
      .collection("Restaurants")
      .findOne({ _id: new ObjectId(restaurantId) });

    if (!restaurant) {
      return res.status(404).send("Restaurant not found.");
    }

    res.render("add-items", {
      ownerId: restaurantOwnerId,
      restaurantId: restaurantId,
    });
  } catch (error) {
    console.error("Error fetching restaurant details:", error);
    res.status(500).send("An error occurred");
  }
});


// add items to db
app.post("/add-items", async (req, res) => {
  try {
    const { restaurantId, item, price, description, category } = req.body;
    const menu = {
      restaurantId,
      item,
      price,
      description,
      category,
    };

    await db.collection("Menu").insertOne(menu);
    res.send("Menu added successfully!");
  } catch (error) {
    console.error("Error saving menu data:", error);
    res.status(500).send("Error menu data : " + error.message);
  }
});


// Restaurant order history
app.get("/restaurant-order-history", async (req, res) => {
  const ownerId = req.query.ownerId;
  const restaurantId = req.query.restaurantId;

  if (!restaurantId) {
    return res.status(400).send("Missing parameters in the request.");
  }

  const orders = await db
    .collection("Orders")
    .find({ restaurantId: restaurantId })
    .toArray();
  const orderHistory = orders || [];

  res.render("restaurant-order-history", {
    ownerId,
    restaurantId,
    orders: orderHistory,
  });
});



// ----------------------------DELIVERY-----------------------------//



// Driver home page
app.get("/driver-home", (req, res) => {
  res.send("<h2>Welcome to Driver Home Page</h2>");
});


// Start the server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
