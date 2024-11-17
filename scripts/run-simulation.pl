for my $i (91..140) {
  my $start = time();
  print(localtime(time())." Running simulation $i\n");
  `npx hardhat test --config hardhat.config.simulation.js  scripts/simulate.js > simulation-logs/$i.log 2>&1`;
  my $elapsed = (time() - $start) / 60;
  print ("Elapsed: $elapsed mins\n");
}
