import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import dotenv from 'dotenv';
import bcrypt from "bcrypt";
// import pool from './db.js'; // Import the pool
import session from "express-session";
import passport from "passport";
import { Strategy } from "passport-local";
import flash from "connect-flash"

const app = express();
const PORT = 3001;


// const db=new pg.Client({
//   user:"postgres",
//   host:"localhost",
//   database:"permalist",
//   password:"postgres@31",
//   port:5432
// })

// db.connect();
dotenv.config();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(session({
  secret:process.env.SESSION_SECRET,
  resave:false,
  saveUninitialized:true,
  })
);

app.use(flash());

// Middleware to make flash messages available globally in EJS
app.use((req, res, next) => {
    res.locals.messages = req.flash();
    next();
});

app.use(passport.initialize());
app.use(passport.session());


const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  // ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  ssl: {
    rejectUnauthorized: false, // required for NeonDB
  },
  max: 20, // Maximum number of connections in the pool (default: 10)
  idleTimeoutMillis: 30000, // Idle timeout before a connection is closed (default: 10 seconds)
  connectionTimeoutMillis: 2000, // Time to wait for a new connection before timing out (default: no timeout)
});

export default pool;
let person="";
let family=null;
let time="Today"; 
let perm=process.env.PERMISSION;
let msg="";
app.get("/", async(req, res) => {
  if(req.isAuthenticated()){
    family=req.user.family_code;
    const user_id=req.user.user_id;
    // console.log(family);
    msg="";

    try{
      if(time==="List"){
        let result;
        if(family!==null){
          result=await pool.query("select * from list where family_code=($1)",[family]);
        }
        else{
          result=await pool.query("select * from list where user_id=($1)",[user_id]);
        }
        const list=result.rows;
        res.render("index.ejs", {
          listTitle: time,
          listItems: list,
          user:user_id,
        });
      }else{
        // console.log("here");
        
        const result=await pool.query("select * from items where time=($1) and acc=($2)",[time,user_id]);
        const tasks=result.rows;
        res.render("index.ejs", {
          listTitle: time,
          listItems: tasks,
          user:user_id,
        });
      }
    }catch(err){
      console.log(err);
    }
  }
  else{
    res.render("logres.ejs")
  }
});

app.post("/",async(req,res)=>{
  if(req.body.logout==="logout") {
    // person="";
    // family=null;
    // time="Today";
    // res.redirect("/");
    
    req.logout((err) => {
      if (err) return next(err);
      req.session.destroy(() => {
        res.redirect("/");
      });
    });

  }
  else if(req.body.timeswitch==="Week") {
    time="Week";
    res.redirect("/");
  }
  else if(req.body.timeswitch==="Today") {
    time="Today";
    res.redirect("/");
  }else if(req.body.timeswitch==="List"){
    time="List";
    res.redirect("/");
  }
})

app.post("/add", async(req, res) => {
  family=req.user.family_code;
  const user_id=req.user.user_id;
  // console.log("here");
  // console.log(req.user);
  
  const item = req.body.newItem;
  if(time==="List"){
    if(item!==""){
    await pool.query("insert into list (title,family_code,user_id) values($1,$2,$3) ",[item,family,user_id])
    }
  }
  else{
    if(item!=="")
    {
      await pool.query("insert into items (title,time,acc) values($1,$2,$3) ",[item,time,user_id])
    }
  }
  res.redirect("/");
});

app.post("/edit", (req, res) => {
  const title_id =req.body.updatedItemId;
  const newtitle=req.body.updatedItemTitle;
  pool.query("update items set title=($1) where id=($2)",[newtitle,title_id]);
  res.redirect("/");


});

app.post("/delete",async (req, res) => {
  const todelete=req.body.deleteItemId;
  family=req.user.family_code;
  const user_id=req.user.user_id;
  console.log("in delete handel");
  console.log(req.user);
  if(time==="List"){
    if(family!==null){
      await pool.query("delete from list where id=($1) and family_code=($2)",[todelete,family]);
    }
    else{
      await pool.query("delete from list where id=($1) and user_id=($2)",[todelete,user_id]);
    }
  }
  await pool.query("delete from items where id=($1) and acc=($2)",[todelete,user_id]);
  res.redirect("/");
});


app.get("/login", (req, res) => {
  // console.log(req.flash("message")+" ok");
  res.render("login.ejs",{message:msg});
});

app.get("/register", (req, res) => {
  res.render("register.ejs");
});



app.post("/register",async(req,res)=>{
  const ekey=req.body.perm;
  if(ekey===perm){
      const f_code=req.body.family_code
      const pass1=req.body.password1;
      const pass2=req.body.password2;
      const userid=req.body.user_id;
      if(pass1===pass2){
        try{
          const check=await pool.query("select * from users where user_id=($1)",[userid]);
          if(check.rows.length===0){
            try{
              if(f_code){
                bcrypt.hash(pass1,10,async(err,hash)=>{
                  if(err){
                    console.log(err);
                  }
                  else{
                    const data=await pool.query("insert into users (user_id,pass,family_code) values($1,$2,$3) returning *",[userid,hash,f_code]);
                    const user=data.rows[0];
                    res.redirect("/");
                    // req.login(user,(err)=>{
                    //   if(err){
                    //     console.log(err);
                    //   }
                    //   console.log("success");
                    // })
                  }
                })
              // person=userid;
              // family=f_code;
              // res.redirect("/")
            }
            else{
              bcrypt.hash(pass1,10,async(err,hash)=>{
                if(err){
                  console.log(err);
                }
                else{
                  await pool.query("insert into users (user_id,pass) values($1,$2)",[userid,hash]);
                }
              })
              person=userid
              res.redirect("/")
              
            }
          }catch(err){
            console.log(err);
          }
        }
      }catch(err){
        console.log(err);
      }
      
    }
    else{
      let msg="password does not match";
      res.render("register.ejs",{message:msg});
    }
  }
  else{
    let msg="incorrect key";
    res.render("register.ejs",{message:msg});
  }
})

passport.use(new Strategy(async function verify(username,password,done){
  const data=await pool.query("SELECT * FROM users WHERE user_id=($1)",[username]);
  if(data.rows.length>0){
    const hash=data.rows[0].pass;
    bcrypt.compare(password,hash,(err,result)=>{
      if(result){
        // person=user;
        // family=data.rows[0].family_code;
        // console.log(user);
        // console.log(family);
        // res.redirect("/");
        const user=data.rows[0];
        // console.log(user.user_id);
        return done(null,user);
      }
        else{
          msg="incorrect password";
          // res.render("login.ejs",{message:msg});
          return done(null,false,{message:"incorrect password"});
        }
      })
    }
    else {
      msg="incorrect username";
      // res.render("login.ejs",{message:msg});
      return done(null,false,{message:"incorrect username"});
    }
  }));
  
passport.serializeUser((user, done) => {
  done(null, { user_id: user.user_id, family_code: user.family_code }); 
});

passport.deserializeUser(async (obj, done) => {
  try {
    const data = await pool.query("SELECT * FROM users WHERE user_id = $1", [obj.user_id]);
    if (data.rows.length > 0) {
      const user = data.rows[0];
      user.family_code = obj.family_code; // Ensure family_code persists
      done(null, user);
    } else {
      done(null, false);
    }
  } catch (err) {
    done(err, null);
  }
});

  
  app.post("/login",passport.authenticate("local",{
    successRedirect:"/",
    failureRedirect: "/login",
    failureFlash: true
    })
  );

//   app.post("/login", (req, res, next) => {
//   console.log("🚀 /login Route Hit with:", req.body); // Debugging log
//   next();
// }, passport.authenticate("local", {
//   successRedirect: "/",
//   failureRedirect: "/login",
//   failureFlash: true
// }));

// app.post("/login", (req, res, next) => {
//   passport.authenticate("local", (err, user, info) => {
//     if (err) {
//       return next(err);
//     }
//     if (!user) {
//       console.log("Flash Message Being Set:", info.message);  // Debugging: Check message value
//       req.flash("message", info.message); 
//       return res.redirect("/login");
//     }
//     req.logIn(user, (err) => {
//       if (err) {
//         return next(err);
//       }
//       return res.redirect("/");
//     });
//   })(req, res, next);
// });




  app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});