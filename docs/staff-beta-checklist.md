# Staff Beta Checklist

Goal: a small group of staff use PartyParadise for real work for 1 to 2 weeks. Clients do not use the portal yet, and online payments stay off.

Mark each item when done. An item only counts if someone has seen it work.

## 1. Before anyone logs in

- [ ] Push `main` to GitHub and confirm CI passes
- [ ] Choose hosting, a domain and HTTPS
- [ ] Copy `.env.production.example` to `.env.production` and fill it in with new secrets
- [ ] Start the app using [the Linux guide](deploy-linux.md) or `docker-compose.prod.yml`
- [ ] `https://<api address>/health` returns `ok`
- [ ] Set your real business email, phone and address, then download an invoice and contract PDF
- [ ] Add the SendGrid key, verify the sender, and receive a password reset email
- [ ] Schedule a daily backup, and restore one copy onto a spare database

## 2. Set up the data

- [ ] Run `python scripts/create_admin.py` for the first admin
- [ ] Create real staff accounts, and each person sets their own password from the invite
- [ ] Give each person the right role: admin, manager or staff
- [ ] Add stock and equipment, and check the expense categories suit you
- [ ] Do not copy test clients, bookings or contracts into production

## 3. Trial run before the beta

One person as each role runs one job from start to finish.

- [ ] Staff: sign in, read a booking, add a booking note, request leave
- [ ] Staff: cannot see colleagues' pay, or approve leave
- [ ] Manager: approve leave and change pay
- [ ] Admin: create a client, booking and contract, then send the contract
- [ ] A person signs the contract from the emailed link
- [ ] Create an invoice from the booking, send it and record a cash or MoMo payment
- [ ] The payment appears on the invoice, the dashboard and the P&L report
- [ ] Record an expense, make a shop sale, and adjust stock
- [ ] Open a dropdown on each person's real device and confirm it is readable

## 4. During the beta

- [ ] Keep the old way of working available as a fallback
- [ ] Name one person to collect problems, with the time and page for each
- [ ] Check the backup ran, each day
- [ ] Check the API logs for errors, each day
- [ ] Review problems at the end of each week

## 5. Finish the beta

Move on only when:

- [ ] Staff have completed real jobs without help
- [ ] No money or booking figures have been wrong
- [ ] No serious problem has been open for more than a few days
- [ ] A backup has been restored successfully

## Not in this beta

These stay off until the client rollout: client portal, online payments, and live Paystack keys. Before then, add refunds, handling for refused Paystack payments, client password reset, and secure cookie sessions.
