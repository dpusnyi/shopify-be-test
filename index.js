let uuid = require('uuid/v1');
let shopify = require('./shopify');
let dotenv = require('dotenv').config();
const axios = require('axios');

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const SHOPIFY_APP_SCOPES = 'read_products, read_orders';
const NGROK_URL = process.env.NGROK_URL;
const REDIRECT_URL = process.env.REDIRECT_URL;

const express = require('express');
const PORT = process.env.PORT || 5000;

express()
  .use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Credentials', true);
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header(
      'Access-Control-Allow-Headers',
      'Origin,X-Requested-With,Content-Type,Accept,content-type,application/json'
    );
    next();
  })
  .get('/shopify', async (request, response) => {
    try {
      if (!request.query.shop) {
        return response
          .status(400)
          .send(
            'Missing shop parameter. Please add ?shop=your-development-shop.myshopify.com to your request.'
          );
      }
      let shop = request.query.shop;
      console.log(shop);
      let state = uuid();
      let redirectUri = `${NGROK_URL}/approved-oauth`;
      let oauthUrl = `https://${shop}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}&scope=${SHOPIFY_APP_SCOPES}&state=${state}&redirect_uri=${redirectUri}`;

      response.send({
        oauthUrl,
      });
    } catch (err) {
      response.send({
        err,
      });
    }
  })
  .get('/approved-oauth', async (request, response) => {
    let { shop, hmac, code, state, timestamp } = request.query;
    https: if (shop && hmac && code && timestamp) {
      if (!shopify.isHMACValid(SHOPIFY_API_SECRET, request.query))
        return response.status(400).send('HMAC validation failed.');

      // Exchange temporary code for a permanent access token.
      let accessToken = await shopify.getAccessToken(
        shop,
        code,
        SHOPIFY_API_KEY,
        SHOPIFY_API_SECRET
      );
      try {
        if (accessToken) {
          response.redirect(`${REDIRECT_URL}?accessToken=${accessToken}`);
        } else {
          response.status(200).send('Access token not found');
        }
      } catch (error) {
        response.status(500).send(error);
      }
    } else {
      response.status(400).send('Required parameters missing.');
    }
  })
  .get('/orders', async (request, response) => {
    try {
      let shop = request.query.shop;
      let one = `https://${shop}.myshopify.com/admin/api/2020-04/orders.json`;
      let two = `https://${shop}.myshopify.com/admin/api/2020-04/shop.json`;

      const requestOne = axios.get(one, {
        headers: {
          'X-Shopify-Access-Token': request.query.accessToken,
        },
      });
      const requestTwo = axios.get(two, {
        headers: {
          'X-Shopify-Access-Token': request.query.accessToken,
        },
      });

      axios
        .all([requestOne, requestTwo])
        .then(
          axios.spread((...responses) => {
            const responseOne = responses[0];
            const responseTwo = responses[1];
            response.send({
              orders: responseOne.data.orders,
              shop: responseTwo.data.shop,
            });
            // use/access the results
          })
        )
        .catch((errors) => {
          response.status(400).send(errors);
        });
    } catch (e) {
      response.status(400).send(errors);
    }
  })
  .get('*', (req, res) => res.send('<h1>no such request</h1>'))
  .listen(PORT, () => console.log(`Listening on ${PORT}`));
