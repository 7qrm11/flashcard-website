alter table users
  alter column scheduler_reward_multiplier set default 1.8;

alter table users
  alter column scheduler_penalty_multiplier set default 0.6;

update users
set scheduler_reward_multiplier = 1.8
where scheduler_reward_multiplier = 1.618033988749895;

update users
set scheduler_penalty_multiplier = 0.6
where scheduler_penalty_multiplier = 0.6180339887498949;

