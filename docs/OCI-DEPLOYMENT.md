# OCI cloud deployment alternative

The lab's cloud bonus asks for AWS EC2. Use these steps only if the instructor accepts Oracle Cloud Infrastructure (OCI) as an equivalent VM provider. The Always Free Ampere A1 allowance is limited to 2 OCPUs and 12 GB RAM total in the home region; instance availability depends on capacity. OCI sign-up can require a payment card for identity verification. Check the current terms and select only resources marked Always Free. Do not upgrade the account to a paid plan for this lab.

## Prepare the VM

1. Create an OCI Ubuntu VM using an Always Free eligible Ampere A1 shape in the account's home region. Use a boot volume within the Always Free storage allowance.
2. Assign a public IPv4 address and create an ingress rule for only the frontend port your team was assigned (`8000 + Student 4's last two ID digits`), plus SSH from your own IP address. Do not open MySQL (`3306`), Redis (`6379`), or Adminer (`8081`) to the internet.
3. Connect with SSH and install Docker Engine and the Docker Compose plugin using Docker's official Ubuntu instructions.
4. Transfer the project folder to the VM after the approved bonus changes have been committed/pushed, or securely copy the project files from the local machine. Do not copy `.env.example` as `.env`; create a VM-local `.env` with strong, unique passwords and the assigned frontend port.
5. On the VM, start the stack with `docker compose up -d --build` and inspect it with `docker compose ps` and `docker compose logs --tail=100`.
6. Open `http://PUBLIC_IP:FRONTEND_PORT` from a browser. Take a screenshot that shows the public URL and a second screenshot of the running containers. Keep the OCI public IP and project URL out of public posts unless the instructor asks for them.

## Security and cleanup

The Compose file does not publish MySQL or Redis. Adminer binds only to the VM's loopback address and is not reachable from outside the VM. Use SSH port forwarding if you need Adminer remotely, for example `ssh -L 8081:127.0.0.1:8081 ubuntu@PUBLIC_IP`, then open `http://127.0.0.1:8081` locally.

After the demo, stop the containers with `docker compose down` if the VM will remain available. If you no longer need the cloud VM, delete the instance and its boot volume from the OCI console to avoid accidentally using paid resources. Preserve screenshots and logs first.
