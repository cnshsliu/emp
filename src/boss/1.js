db.customers.aggregate([
  {
    $group:
    {
      _id: "$industry",
      count: {$sum: 1},
      sum_oppsize: {$sum: "$oppsize"},
      sum_contract: {$sum: "$contract"},
      avg_oppsize: {$avg: "$oppsize"},
      avg_contract: {$avg: "$contract"},
    }
  }
]);
