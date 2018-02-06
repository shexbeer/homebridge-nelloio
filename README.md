# homebridge-nelloio


Example config.json:

```
    "accessories": [
        {
            "accessory": "Nelloio",
            "name": "Haustür",
            "username":"<INSERT YOUR ACCOUNT MAIL ADRESS>",
            "password":"<INSERT YOUR ACCOUNT PASSWORD>"
        } 
    ]

```

You will need to create a user (further called homebridge user) inside nello app and give him permanent access.
Then logout your user from nello app and request a new password for homebridge user.
You'll receive a mail with a temporary password by mail.
With this password login homebridge user into app.

--> your homebridge nello user is setup, you can login you own user into your nello app again
--> enter the homebridge nello user credentials into your config.json