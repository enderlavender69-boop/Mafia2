"use strict";
// donhelp.js — the text behind the Don-only /don-help slash command.
//
// It lists EVERY command Cosa understands, in one plain list:
//   1. every slash command (built live from the real `commands` array, so a slash command
//      added later shows up here automatically), and
//   2. every text command ("Cosa ...") from the registry below.
//
// The registry is kept honest by tests/don-help.test.js, which runs every `sample` through the
// REAL detectMasterCommand/detectPublicCommand code and checks that all 224+ parser actions are
// covered. If you add a text command to index.js, the test fails until you add it here.
//
// Entry shapes:
//   E(usage, description, sample, expectedAction(s), audience)  — handled by a parser; `sample` is
//        fed to the real parser and must produce one of the expected action(s).
//   D(usage, description, sourceFragment, audience)             — handled directly in index.js;
//        `sourceFragment` must still appear in index.js (so a removed command can't linger here).
// audience: "all" (everyone) | "mod" (needs a Family rank with that permission) | "boss" (Boss rank+)
//           | "don" (Mr.EnderLavender only)

const E = (u, d, s, a, w = "all") => ({ kind: "parsed", u, d, s, a: [].concat(a), w });
const D = (u, d, k, w = "don") => ({ kind: "direct", u, d, k, w });
const U1 = "<@111111111111111111>";
const U2 = "<@222222222222222222>";
const RIVAL = "<@333333333333333333>";

const SECTIONS = [
  { title: "WALLET & INCOME", items: [
    E("Cosa balance [@user]", "check a wallet", "cosa balance", "balance"),
    E("Cosa daily", "claim the daily reward", "cosa daily", "daily"),
    E("Cosa daily rates", "daily reward for every rank", "cosa daily rates", "daily_rates", "don"),
    E("Cosa work", "safe pay, 10m cooldown", "cosa work", "work"),
    E("Cosa crime", "risky pay, 10m cooldown", "cosa crime", "crime"),
    E("Cosa scavenge", "pocket change, 1m cooldown", "cosa scavenge", "scavenge"),
    E("Cosa smuggle", "high stakes, 90m cooldown", "cosa smuggle", "smuggle"),
    E("Cosa jobs | hustles", "explain the job commands", "cosa jobs", "jobs_help"),
    E("Cosa cooldowns | cds | timers", "show your cooldowns", "cosa cooldowns", "cooldowns"),
    E("Cosa quests", "daily quest board", "cosa quests", "quests"),
    E("Cosa quest claim", "claim the all-quests-done bonus", "cosa quest claim", "quest_claim"),
    E("Cosa pay @user <amt>", "send money to a player", `cosa pay ${U1} 100`, "pay"),
    E("Cosa gift @user <amt>", "gift money (small tax, daily cap)", `cosa gift ${U1} 100`, "gift"),
    E("Cosa rob @user", "rob a player's wallet", `cosa rob ${U1}`, "rob"),
    E("Cosa rob bank @user", "crew bank heist, 6h cooldown", `cosa rob bank ${U1}`, "rob_bank"),
    E("Cosa leaderboard | richest | lb", "richest players", "cosa leaderboard", "leaderboard"),
    E("Cosa notoriety | noto | rep [@user]", "notoriety tier and XP", "cosa notoriety", "notoriety"),
  ] },
  { title: "LOANS & DEBT", items: [
    E("Cosa loans", "show the loan options", "cosa loans", "loan_info"),
    E("Cosa normal loan", "take a normal loan", "cosa normal loan", "loan"),
    E("Cosa elite loan", "take an elite loan", "cosa elite loan", "loan"),
    E("Cosa ultra loan", "take an ultra loan", "cosa ultra loan", "loan"),
    E("Cosa debt", "check what you owe", "cosa debt", "check_debt"),
    E("Cosa pay loan <amt>", "repay a loan", "cosa pay loan 100", "pay_loan"),
    E("Cosa pay debt <amt>", "repay debt", "cosa pay debt 100", "pay_debt"),
  ] },
  { title: "BANK", items: [
    E("Cosa bank", "your vault balance", "cosa bank", "bank_balance"),
    E("Cosa bank tiers", "list the vault tiers", "cosa bank tiers", "bank_tiers"),
    E("Cosa bank upgrade", "upgrade your vault", "cosa bank upgrade", "bank_upgrade"),
    E("Cosa bank deposit <amt>", "put money in the vault", "cosa bank deposit 100", "bank_deposit"),
    E("Cosa bank withdraw <amt>", "take money out", "cosa bank withdraw 100", "bank_withdraw"),
  ] },
  { title: "GAMBLING  (amounts accept 5k, 2.5m ... up to vg; also stellar/diamonds/gold/chips/silver/cash/copper)", items: [
    E("Cosa slots [amt]", "slot machine", "cosa slots 100", "slots"),
    E("Cosa coinflip <amt> heads|tails", "coin flip", "cosa coinflip 100 heads", "coinflip"),
    E("Cosa wheel [amt]", "wheel of fortune", "cosa wheel 100", "wheel"),
    E("Cosa race [amt]", "horse race", "cosa race 100", "race"),
    E("Cosa blackjack | bj [amt]", "start blackjack", "cosa blackjack 100", "blackjack"),
    E("Cosa hit", "blackjack: take a card", "cosa hit", "bj_hit"),
    E("Cosa stand", "blackjack: hold", "cosa stand", "bj_stand"),
    E("Cosa roulette <amt> <bet>", "bet: red/black/odd/even/low/high/1st-3rd dozen/0-36", "cosa roulette 100 red", "roulette"),
    E("Cosa mystery box [amt]", "mystery box", "cosa mystery box 100", "mysterybox"),
    E("Cosa arena [amt] [difficulty]", "easy/medium/hard/extreme/nightmare/boss", "cosa arena 100 hard", "arena"),
    E("Cosa mines [amt]", "minesweeper gamble", "cosa mines 100", "minesweeper"),
    E("Cosa heist <amt>", "start a live group heist", "cosa heist 500", "heist_start"),
    E("Cosa heist join", "join the live heist", "cosa heist join", "heist_join"),
  ] },
  { title: "LAUNDERING, ADVENTURE & SHOP", items: [
    E("Cosa launder", "wash Black Money clean (30 min)", "cosa launder", "launder"),
    E("Cosa launder status", "check the wash", "cosa launder status", "launder_status"),
    E("Cosa explore [location]", "start an expedition (3 stages)", "cosa explore forest", "explore"),
    E("Cosa explore cancel", "bail out, keep what you earned", "cosa explore cancel", "explore_cancel"),
    E("Cosa choose 1|2", "pick a path in an expedition", "cosa choose 1", "explore_choose"),
    E("Cosa treasures", "your collected loot", "cosa treasures", "treasures"),
    E("Cosa sell <id> [qty]", "cash out a treasure", "cosa sell gem 2", "sell_treasure"),
    E("Cosa shop", "view shop items", "cosa shop", "shop"),
    E("Cosa shop buy <id> [qty]", "buy an item", "cosa shop buy lucky_charm 2", "shop_buy"),
    E("Cosa use <id> [arg]", "use an item (kings_call takes a TICKER)", "cosa use kings_call GOLD", "shop_use"),
    E("Cosa inventory", "your items", "cosa inventory", "inventory"),
  ] },
  { title: "STOCKS & EXCHANGE", items: [
    E("Cosa stocks", "IRON / GOLD / SILK panel", "cosa stocks", "stocks"),
    E("Cosa stocks <TICKER>", "zoomed chart of one stock", "cosa stocks GOLD", "stock_single"),
    E("Cosa market", "ARMS / DARK / RUNE panel", "cosa market", "market_panel"),
    E("Cosa market <TICKER>", "zoomed chart", "cosa market ARMS", "stock_single"),
    E("Cosa trade", "COAL / GRAIN / WOOD penny panel", "cosa trade", "penny_panel"),
    E("Cosa trade <TICKER>", "zoomed chart", "cosa trade COAL", "stock_single"),
    E("Cosa exchange", "TITAN / OMERTA / CROWN whale shares", "cosa exchange", "exchange"),
    E("Cosa stock buy <TICKER> <shares|all>", "buy shares", "cosa stock buy GOLD 5", "stock_buy"),
    E("Cosa stock sell <TICKER> <shares|all>", "sell shares", "cosa stock sell GOLD 5", "stock_sell"),
    E("Cosa stock portfolio", "your holdings", "cosa stock portfolio", "stock_portfolio"),
    E("Cosa stock history", "your trades", "cosa stock history", "stock_history"),
    E("Cosa stock firm", "live charts of every Family firm", "cosa stock firm", "stock_firm"),
  ] },
  { title: "FIRMS (player-run companies)", items: [
    E("Cosa firm create <name> <TICKER> <price>", "found a firm (then confirm)", "cosa firm create Acme Corp ACME 100", ["firm_create", "firm_create_help"]),
    E("Cosa firm confirm", "confirm firm creation", "cosa firm confirm", "firm_confirm"),
    E("Cosa firm cancel", "cancel firm creation", "cosa firm cancel", "firm_cancel"),
    E("Cosa firm issue <TICKER> <shares>", "issue new shares (owner)", "cosa firm issue ACME 100", "firm_issue"),
    E("Cosa firm price set <TICKER> <price>", "set the share price (owner)", "cosa firm price set ACME 120", "firm_price_set"),
    E("Cosa firm deposit <TICKER> <amt>", "fund the firm treasury", "cosa firm deposit ACME 500", "firm_deposit"),
    E("Cosa firm dividends <TICKER> <amt>", "pay shareholders", "cosa firm dividends ACME 500", "firm_dividends"),
    E("Cosa firm buy <TICKER> <shares|all>", "buy firm shares", "cosa firm buy ACME 5", "firm_buy"),
    E("Cosa firm sell <TICKER> <shares|all>", "sell firm shares", "cosa firm sell ACME 5", "firm_sell"),
    E("Cosa firm info <TICKER>", "firm details", "cosa firm info ACME", "firm_info"),
    E("Cosa firm list", "all firms", "cosa firm list", "firm_list"),
    E("Cosa firm portfolio", "your firm shares", "cosa firm portfolio", "firm_portfolio"),
  ] },
  { title: "PRESTIGE", items: [
    E("Cosa prestige", "Respect balance, bonus, ascend progress", "cosa prestige", "prestige"),
    E("Cosa prestige ascend", "wipe wallet+bank for permanent Respect (1B lifetime)", "cosa prestige ascend", "prestige_ascend"),
    E("Cosa prestige confirm", "confirm the ascension", "cosa prestige confirm", "prestige_confirm"),
    E("Cosa prestige tree", "the upgrade tree", "cosa prestige tree", "prestige_tree"),
    E("Cosa prestige buy <upgrade>", "spend Respect on an upgrade", "cosa prestige buy speed", "prestige_buy"),
    E("Cosa prestige leave | done | exit", "return to normal play after ascending", "cosa prestige leave", "prestige_leave"),
    E("Cosa prestige leaderboard", "top Respect holders", "cosa prestige leaderboard", "prestige_leaderboard", "don"),
  ] },
  { title: "GANGS, TURF, ALLIANCES, BUSINESSES, BOUNTIES", items: [
    E("Cosa gang create <name>", "start a gang", "cosa gang create Wolves", "gang_create"),
    E("Cosa gang invite @user", "invite a member", `cosa gang invite ${U1}`, "gang_invite"),
    E("Cosa gang accept", "accept an invite", "cosa gang accept", "gang_accept"),
    E("Cosa gang leave", "leave your gang", "cosa gang leave", "gang_leave"),
    E("Cosa gang disband", "disband (leader)", "cosa gang disband", "gang_disband"),
    E("Cosa gang kick @user", "kick a member", `cosa gang kick ${U1}`, "gang_kick"),
    E("Cosa gang promote @user officer|member", "change a member's role (leader)", `cosa gang promote ${U1} officer`, "gang_promote"),
    E("Cosa gang transfer @user", "hand over leadership", `cosa gang transfer ${U1}`, "gang_transfer"),
    E("Cosa gang deposit <amt>", "add Cash to the gang treasury", "cosa gang deposit 100", "gang_deposit"),
    E("Cosa gang withdraw <amt>", "take from the treasury", "cosa gang withdraw 100", "gang_withdraw"),
    E("Cosa gang [info] [name|@user]", "gang details", "cosa gang info Wolves", "gang_info"),
    E("Cosa gang bribe @user <amt>", "offer a bribe", `cosa gang bribe ${U1} 100`, "gang_bribe"),
    E("Cosa gang bribe accept", "accept a bribe", "cosa gang bribe accept", "gang_bribe_accept"),
    E("Cosa gang bribe decline", "decline a bribe", "cosa gang bribe decline", "gang_bribe_decline"),
    E("Cosa turf | turf list", "all zones and who holds them", "cosa turf list", "turf_list"),
    E("Cosa turf claim <zone>", "claim unclaimed turf", "cosa turf claim docks", "turf_claim"),
    E("Cosa turf attack <zone>", "fight for held turf", "cosa turf attack docks", "turf_attack"),
    E("Cosa alliance propose <gang>", "propose an alliance (leaders)", "cosa alliance propose Wolves", "alliance_propose"),
    E("Cosa alliance accept", "accept an alliance", "cosa alliance accept", "alliance_accept"),
    E("Cosa alliance break <gang>", "end an alliance", "cosa alliance break Wolves", "alliance_break"),
    E("Cosa business [@user]", "list businesses", "cosa business", "business_list"),
    E("Cosa business buy <type>", "laundromat/nightclub/shipping/casino", "cosa business buy casino", "business_buy"),
    E("Cosa business upgrade <type>", "next tier", "cosa business upgrade casino", "business_upgrade"),
    E("Cosa business security <type>", "upgrade defenses", "cosa business security casino", "business_security"),
    E("Cosa business collect <type>", "claim pending income", "cosa business collect casino", "business_collect"),
    E("Cosa business pay <type>", "pay owed upkeep", "cosa business pay casino", "business_pay"),
    E("Cosa business raid @user <type>", "raid someone's business", `cosa business raid ${U1} casino`, "business_raid"),
    E("Cosa bounty place @user <amt>", "put a bounty on someone", `cosa bounty place ${U1} 100`, "bounty_place"),
    E("Cosa bounty board", "active bounties", "cosa bounty board", "bounty_board"),
  ] },
  { title: "CHESS (bot-commands channel)", items: [
    E("Cosa chess @user [1|3|5|10|15|30]", "challenge a player (minutes per side)", `cosa chess ${U1} 5`, "chess_challenge"),
    E("Cosa chess bot [difficulty] [minutes]", "beginner/intermediate/advanced/master/grandmaster", "cosa chess bot master 5", "chess_bot"),
    E("Cosa chess accept", "accept a challenge", "cosa chess accept", "chess_accept"),
    E("Cosa chess decline", "decline a challenge", "cosa chess decline", "chess_decline"),
    E("Cosa chess resign", "resign", "cosa chess resign", "chess_resign"),
    E("Cosa chess end", "force-end your game", "cosa chess end", "chess_end"),
    E("Cosa chess queue", "who is waiting", "cosa chess queue", "chess_queue"),
    E("Cosa chess timer", "time left for each side", "cosa chess timer", "chess_timer"),
    E("Cosa chess board", "show the board", "cosa chess board", "chess_board"),
    E("Cosa move <from> <to> [q|r|b|n]", "play a move, e.g. Cosa move e2 e4", "cosa move e2 e4", "chess_move"),
  ] },
  { title: "FUN, SOCIAL & INFO", items: [
    E("Cosa 8ball [question]", "magic 8-ball", "cosa 8ball will it work", "8ball"),
    E("Cosa rps rock|paper|scissors", "rock paper scissors", "cosa rps rock", "rps"),
    E("Cosa roll [sides]", "roll a die", "cosa roll 20", "roll"),
    E("Cosa truth", "truth question", "cosa truth", "truth"),
    E("Cosa dare", "dare", "cosa dare", "dare"),
    E("Cosa truth or dare", "random truth or dare", "cosa truth or dare", "truth_or_dare"),
    E("Cosa ship @user1 @user2", "compatibility", `cosa ship ${U1} ${U2}`, "ship"),
    E("Cosa debate [topic]", "Cosa argues a topic", "cosa debate pineapple pizza", "debate"),
    E("Cosa quiz | trivia", "one trivia question", "cosa quiz", "quiz"),
    E("Cosa prophecy [@user]", "a prophecy", "cosa prophecy", "prophecy"),
    E("Cosa poll <question>", "start a poll", "cosa poll pizza or tacos", "poll"),
    E("Cosa remind me in <time> <reason>", "set a reminder", "cosa remind me in 10 minutes call mom", "remind"),
    E("Cosa serverinfo", "server info", "cosa serverinfo", "serverinfo"),
    E("Cosa userinfo [@user]", "user info", "cosa userinfo", "userinfo"),
    E("Cosa mood", "Cosa's current mood", "cosa mood", "show_mood"),
    E("Cosa afk [reason]", "go AFK", "cosa afk lunch", "afk"),
    E("Cosa back", "clear AFK", "cosa back", "afk_back"),
    E("Cosa marry @user", "propose", `cosa marry ${U1}`, "marry"),
    E("Cosa marry accept", "accept a proposal", "cosa marry accept", "marry_accept"),
    E("Cosa marry decline", "decline a proposal", "cosa marry decline", "marry_decline"),
    E("Cosa marriage", "marriage status", "cosa marriage", "marriage_status"),
    E("Cosa divorce", "divorce (costs Cash)", "cosa divorce", "divorce"),
    E("Cosa help | commands | cmds", "player command list", "cosa help", "help"),
    E("Cosa eco | economy", "economy command list", "cosa eco", "eco_help"),
    E("Cosa rank help | rank commands", "moderator command list for your rank", "cosa rank help", "rank_help"),
  ] },
  { title: "MODERATION  (needs a Family rank with that permission; the Don can do all)", items: [
    E("Cosa warn @user [reason]", "warn someone", `cosa warn ${U1} spam`, "warn", "mod"),
    E("Cosa warnings @user", "list a user's warnings", `cosa warnings ${U1}`, "warnings", "mod"),
    E("Cosa mute | timeout @user [time]", "mute", `cosa mute ${U1} 10m`, "mute", "mod"),
    E("Cosa unmute | untimeout @user", "unmute", `cosa unmute ${U1}`, "unmute", "mod"),
    E("Cosa roast @user", "roast someone", `cosa roast ${U1}`, "roast", "mod"),
    E("Cosa diss @rival-bot", "argue with the configured rival bot", `cosa diss ${RIVAL}`, "rival_diss", "mod"),
    E("Cosa slime out @user [time]", "slime someone out", `cosa slime out ${U1} 10m`, "slimeout", "mod"),
    E("Cosa kick @user [reason]", "kick (asks to confirm)", `cosa kick ${U1} rude`, "kick_confirm", "mod"),
    E("Cosa ban @user [reason]", "ban (asks to confirm)", `cosa ban ${U1} rude`, "ban_confirm", "mod"),
    E("Cosa unban @user | <userId>", "unban", `cosa unban ${U1}`, "unban", "mod"),
    E("Cosa purge | nuke [amount]", "delete messages, max 100 (asks to confirm)", "cosa purge 20", "purge_confirm", "mod"),
    E("Cosa slowmode <time> | off", "set or remove slowmode", "cosa slowmode 10s", "slowmode", "mod"),
    E("Cosa lockdown", "lock the server channels", "cosa lockdown", "lockdown", "mod"),
    E("Cosa unlock", "lift the lockdown", "cosa unlock", "unlock", "mod"),
    E("Cosa strip all roles from @user", "strip every role (asks to confirm)", `cosa strip all roles from ${U1}`, "strip_confirm", "mod"),
    E("Cosa give @user the <role> role", "give a role", `cosa give ${U1} the VIP role`, "give_role", "mod"),
    E("Cosa delete this", "delete Cosa's last message", "cosa delete this", "delete_reply", "mod"),
  ] },
  { title: "BOSS SETUP  (Boss rank and above, and the Don)", items: [
    D("Cosa set channel <type>", "run in a channel to designate it; types: general, lockdown, exile, shadowcourt, modlogs, talk, botcommands", "cosa\\s+set\\s+channel", "boss"),
    D("Cosa remove channel <type>", "un-designate a channel type", "cosa\\s+remove\\s+channel", "boss"),
    D("Cosa set main role <role> / remove main role <role> / main roles", "roles protected from blackout stripping", "cosa\\s+(set|add)\\s+main\\s+role", "boss"),
    D("Cosa setup notoriety roles", "auto-create all 10 notoriety tier roles", "cosa\\s+(setup|create)\\s+notoriety\\s+roles", "boss"),
    D("Cosa set notoriety role <tier> @role", "point a tier at an existing role", "cosa\\s+set\\s+notoriety\\s+role", "boss"),
    D("Cosa remove notoriety role <tier>", "unmap a tier", "cosa\\s+(remove|unset)\\s+notoriety\\s+role", "boss"),
    D("Cosa notoriety roles", "list tier-to-role mappings", "cosa\\s+notoriety\\s+roles", "boss"),
  ] },
  { title: "DON ONLY: FAMILY, EXILE & SURVEILLANCE", items: [
    E("Cosa bestow <rank> upon @user", "give a Family rank", `cosa bestow Boss upon ${U1}`, "bestow", "don"),
    E("Cosa revoke @user | Cosa strip @user", "remove their Family rank title", `cosa revoke ${U1}`, "revoke_title", "don"),
    E("Cosa family ledger", "the Family roster", "cosa family ledger", "family_ledger", "don"),
    E("Cosa exile @user", "exile (asks to confirm)", `cosa exile ${U1}`, "exile_confirm", "don"),
    E("Cosa temp exile @user <time>", "timed exile (asks to confirm)", `cosa temp exile ${U1} 1h`, "temp_exile_confirm", "don"),
    E("Cosa unexile @user", "release from exile", `cosa unexile ${U1}`, "unexile", "don"),
    E("Cosa watchlist @user", "put someone on the watchlist", `cosa watchlist ${U1}`, "watchlist", "don"),
    E("Cosa add @user to shadow list", "shadow-list a user", `cosa add ${U1} to shadow list`, "shadow_user_add", "don"),
    E("Cosa remove @user from shadow list", "un-shadow-list a user", `cosa remove ${U1} from shadow list`, "shadow_user_remove", "don"),
    E("Cosa shadow add <phrase>", "add a shadow trigger phrase", "cosa shadow add badword", "shadow_trigger_add", "don"),
    E("Cosa shadow remove <phrase>", "remove a shadow trigger phrase", "cosa shadow remove badword", "shadow_trigger_remove", "don"),
    E("Cosa shadow vote | court @user", "open a Sit-Down trial", `cosa shadow vote ${U1}`, "shadow_vote", "don"),
    E("Cosa bail @user [condition]", "grant bail", `cosa bail ${U1} loyalty`, "bail", "don"),
    E("Cosa fake raid", "psych-warfare fake raid", "cosa fake raid", "fake_raid", "don"),
    E("@Cosa timers", "view dead-man / psych / inactivity timers", "timers", "view_timers", "don"),
    E("Cosa set timer deadman|psychwar|psychfirst|inactivity <time>", "change a timer", "cosa set timer deadman 1h", "set_timer", "don"),
    E("Cosa psychchances", "view psych-warfare chances", "cosa psychchances", "view_psychchances", "don"),
    E("Cosa set psychchance summon|lockdown|dm|wanted <0-100>", "change a chance", "cosa set psychchance summon 40", "set_psychchance", "don"),
    E("Cosa set diss chance <0-100>", "chance to randomly diss the rival bot", "cosa set diss chance 15", "set_diss_chance", "don"),
    E("Cosa set mood <mood>", "wrathful/aggressive/cold/diplomatic/cryptic/playful", "cosa set mood cold", "set_mood", "don"),
    E("Cosa clear memory | history | chat", "wipe this server's chat memory", "cosa clear memory", "clear_memory", "don"),
    E("Cosa clone server <guildId>", "copy another server's structure here", "cosa clone server 123456789012345678", "clone_server", "don"),
    E("Cosa ai status | health | stats", "AI model health and counters", "cosa ai status", "ai_status", "don"),
    D("Cosa defense on|off|status | defense reset @user", "auto warn+mute for abuse aimed at Cosa", "cosa\\s+defen[cs]e", "don"),
    D("Cosa psychwar on|off|status", "psych-warfare master switch", "cosa\\s+psych(?:war|ological\\s+warfare)", "don"),
    D("Cosa remember <fact> | forget <fact> | show memories [page N]", "Cosa's long-term memory", "cosa\\s+(?:show|list)\\s+memor", "don"),
  ] },
  { title: "DON ONLY: ECONOMY ADMIN", items: [
    E("Cosa set balance @user <amt> [tier]", "set a balance", `cosa set balance ${U1} 1000`, "eco_set", "don"),
    E("Cosa reset balance @user", "wipe a balance to zero", `cosa reset balance ${U1}`, "eco_reset", "don"),
    E("Cosa give @user <amt> [tier]", "add money", `cosa give ${U1} 100`, "eco_give", "don"),
    E("Cosa take @user <amt> [tier]", "remove money", `cosa take ${U1} 100`, "eco_take", "don"),
    E("Cosa tax @user [%]", "seize a % of their balance", `cosa tax ${U1} 10`, "eco_tax", "don"),
    E("Cosa heist @user", "steal EVERYTHING from a user", `cosa heist ${U1}`, "eco_heist", "don"),
    E("Cosa blacklist gamble @user", "ban from gambling", `cosa blacklist gamble ${U1}`, "eco_gamble_ban", "don"),
    E("Cosa unblacklist @user", "lift the gambling ban", `cosa unblacklist ${U1}`, "eco_gamble_unban", "don"),
    E("Cosa clear taint @user", "clear the Black/White money split", `cosa clear taint ${U1}`, "clear_taint", "don"),
    E("Cosa clear wanted @user", "clear the Marked/Most Wanted tag", `cosa clear wanted ${U1}`, "clear_wanted", "don"),
    E("Cosa set xp @user <n>", "set notoriety XP", `cosa set xp ${U1} 500`, "eco_setxp", "don"),
    E("Cosa add xp @user <n>", "add notoriety XP (negative removes)", `cosa add xp ${U1} 500`, "eco_addxp", "don"),
    E("Cosa set tier @user <tier>", "set notoriety tier (Nobody ... Kingpin)", `cosa set tier ${U1} legend`, "eco_settier", "don"),
    E("Cosa eco ban @user", "ban from the economy", `cosa eco ban ${U1}`, "eco_ban", "don"),
    E("Cosa eco unban @user", "lift the economy ban", `cosa eco unban ${U1}`, "eco_unban", "don"),
    E("Cosa admin help", "economy admin command list", "cosa admin help", "eco_admin_help", "don"),
    E("Cosa eco stats", "economy overview", "cosa eco stats", "eco_stats", "don"),
    E("Cosa eco wipe rich", "wipe wallets with 10,000,000+ Cash (!)", "cosa eco wipe rich", "wipe_rich", "don"),
    E("Cosa bank wipe all", "wipe ALL bank balances (!)", "cosa bank wipe all", "bank_wipe_all", "don"),
    E("Cosa reset rob shields", "strip every Rob Shield server-wide", "cosa reset rob shields", "reset_rob_shields", "don"),
    E("Cosa reset cooldowns", "reset EVERYONE's cooldowns (!)", "cosa reset cooldowns", "reset_all_cooldowns", "don"),
    E("Cosa peasant mode [on|off]", "let yourself be robbed like anyone else", "cosa peasant mode on", "peasant_mode", "don"),
  ] },
  { title: "DON ONLY: MARKETS, FIRMS & EVENTS", items: [
    E("Cosa market tick", "force a market tick and new candle", "cosa market tick", "market_tick", "don"),
    E("Cosa market open | close", "open or close trading", "cosa market open", "market_toggle", "don"),
    E("Cosa market pump <TICKER> <rounds>", "pump a stock", "cosa market pump GOLD 3", "market_pump", "don"),
    E("Cosa market crash <TICKER> <rounds>", "crash a stock", "cosa market crash GOLD 3", "market_crash", "don"),
    E("Cosa firm pump <TICKER> <rounds>", "pump a firm (max 10 rounds)", "cosa firm pump ACME 3", "firm_pump", "don"),
    E("Cosa firm bomb <TICKER> <rounds>", "crash a firm in red candles", "cosa firm bomb ACME 3", "firm_bomb", "don"),
    E("Cosa firm delete <TICKER> [reason]", "dissolve a firm, refund holders", "cosa firm delete ACME fraud", "firm_delete", "don"),
    E("Cosa firm crash <TICKER> <%> [reason]", "crash a firm's price", "cosa firm crash ACME 80 rug pull", "firm_crash", "don"),
    E("Cosa firm sanction <TICKER> <type> [reason]", "trading_ban/share_lock/dividend_freeze/price_lock/capital_levy", "cosa firm sanction ACME share_lock fraud", "firm_sanction", "don"),
    E("Cosa firm escalate <TICKER> [reason]", "50% crash + share_lock + ping holders", "cosa firm escalate ACME fraud", "firm_escalate", "don"),
    E("Cosa firm unsanction <TICKER> <type>", "lift one sanction", "cosa firm unsanction ACME share_lock", "firm_unsanction", "don"),
    E("Cosa firm registry", "all firms with owner and status", "cosa firm registry", "firm_registry", "don"),
    E("Cosa giveaway <amt> <duration>", "start a giveaway", "cosa giveaway 1000 10m", ["giveaway", "giveaway_help"], "don"),
    E("Cosa greroll <messageId> | giveaway reroll <messageId>", "reroll a giveaway winner", "cosa greroll 123456789012345678", "greroll", "don"),
  ] },
  { title: "DON ONLY: MODES, BLACKOUT & CONFIRMATIONS", items: [
    D("Cosa show loyalty | Cosa loyalty off", "turn Loyalty Mode on / off (talk in plain English)", "cosa\\s+show\\s+loyalty", "don"),
    D("Cosa enable jarvis | Cosa disable jarvis (or: jarvis off)", "Jarvis persona + plain-English commands + web search", "cosa\\s+enable\\s+jarvis", "don"),
    D("Cosa reset | clear pending | clear commands", "clear a stuck pending confirmation", "cosa\\s+(reset|clear\\s+pending", "don"),
    D("Cosa execute blackout, then say Yes twice", "lock every channel + strip roles (!)", "cosa\\s+execute\\s+blackout", "don"),
    D("Lift Lockdown", "lift a blackout/lockdown", "lift\\s+lockdown", "don"),
    D("Cosa undo blackout strip", "restore roles stripped by a blackout", "cosa\\s+undo\\s+blackout\\s+strip", "don"),
    D("Cosa stop | shut up | be quiet | silence | enough", "silence Cosa in this channel", "cosa\\s+(stop|shut up", "mod"),
    D("Cosa wake up | resume | come back | talk again", "let Cosa talk again", "cosa\\s+(wake up|come back", "mod"),
    D("yes | execute | cancel", "answer a confirmation prompt (only the person who asked can)", "Only the person who issued that command can confirm it", "mod"),
  ] },
  { title: "LOYALTY / JARVIS PLAIN-ENGLISH ACTIONS  (while either mode is ON, just ask)", items: [
    D("create / delete / rename a channel", "e.g. \"create a channel called deals\", \"rename this to war-room\"", "create_channel", "don"),
    D("create / delete a category", "e.g. \"create a category named Ops\"", "create_category", "don"),
    D("create / edit / give / remove a role", "e.g. \"make a role VIP, gold, give it to @user\"", "give_role", "don"),
    D("kick / ban / unban / mute / unmute / exile / unexile a member", "risky ones ask for one execute/cancel", "unexile_god", "don"),
    D("lock / unlock / slowmode a channel", "e.g. \"lock this channel down\"", "lock_channel", "don"),
    D("send a message in a channel", "e.g. \"say <message> in #channel\"", "send_message", "don"),
    D("remember / forget / list memories", "e.g. \"remember that Jake is trusted\"", "list_memory", "don"),
    D("several commands, one per line", "runs as a batch with live progress and one confirmation", "Batches", "don"),
  ] },
];

// Slash-command section, built from the real command JSON so it can never drift.
function slashLines(commandJSONs) {
  const out = [];
  const optStr = (opts) => (opts || [])
    .filter((o) => !o.__sub && !o.__group && o.type !== 1 && o.type !== 2)
    .map((o) => (o.required ? `<${o.name}>` : `[${o.name}]`)).join(" ");
  const isSub = (o) => o.type === 1 || o.type === 2 || o.__sub || o.__group;
  for (const c of commandJSONs) {
    const subs = (c.options || []).filter(isSub);
    if (!subs.length) { out.push(`/${c.name} ${optStr(c.options)}`.replace(/ +$/, "") + ` — ${c.description}`); continue; }
    out.push(`/${c.name} — ${c.description}`);
    for (const s of subs) {
      const inner = (s.options || []).filter(isSub);
      if (inner.length) { for (const t of inner) out.push(`   /${c.name} ${s.name} ${t.name} ${optStr(t.options)}`.replace(/ +$/, "") + ` — ${t.description}`); }
      else out.push(`   /${c.name} ${s.name} ${optStr(s.options)}`.replace(/ +$/, "") + ` — ${s.description}`);
    }
  }
  return out;
}

const WHO_TAG = { all: "", mod: "  [rank]", boss: "  [Boss+]", don: "  [Don]" };
function textLines() {
  const lines = [];
  for (const sec of SECTIONS) {
    lines.push("", `── ${sec.title} ──`);
    for (const it of sec.items) lines.push(`${it.u} — ${it.d}${WHO_TAG[it.w] || ""}`);
  }
  return lines;
}

// Split into pages that fit one Discord embed (description limit 4096; we stay well under, and the
// ``` fences are added by the caller). Never splits in the middle of a line.
function paginate(lines, limit = 3800) {
  const pages = []; let cur = "";
  for (const line of lines) {
    if (cur && (cur.length + 1 + line.length) > limit) { pages.push(cur); cur = line; }
    else cur = cur ? cur + "\n" + line : line;
  }
  if (cur) pages.push(cur);
  return pages.map((p) => p.replace(/^\n+/, ""));
}

function buildDonHelpPages(commandJSONs) {
  const lines = [
    "DON HELP — every command Cosa has (only you can see this)",
    "Text commands start with \"Cosa\" (or @Cosa). [Don] = Mr.EnderLavender only, [rank] = needs a Family rank, [Boss+] = Boss rank and up.",
    "",
    "── SLASH COMMANDS ──",
    ...slashLines(commandJSONs),
    ...textLines(),
  ];
  return paginate(lines);
}

module.exports = { SECTIONS, slashLines, textLines, paginate, buildDonHelpPages, SAMPLE_USERS: { U1, U2, RIVAL } };
