# hsr

Should make something like this:

{
    "players": [
        {
            "name": "player1",
            "isFriendly": true,
            "goingFirst": true,
            "isWinner": true,
            "class": "warlock"
        },
        {
            "name": "player2",
            "isFriendly": false,
            "goingFirst": false,
            "isWinner": false,
            "class": "priest"
        }
    ],
    "turns": [
        {
            "0": [
                { "transition": "card1,player1,deck,hand" },
                { "transition": "card2,player1,deck,hand" },
                { "transition": "card3,player1,deck,hand" },
                { "transition": "card4,player2,deck,hand" },
                { "transition": "card5,player2,deck,hand" },
                { "transition": "card6,player2,deck,hand" },
                { "transition": "card7,player2,deck,hand" },
                { "transition": "card1,player1,hand,deck" },
                { "transition": "card8,player1,deck,hand" },
                { "transition": "coin,player2,deck,hand" },
                { "game": "endturn" }
            ],
            "1" : [
                { "transition": "card9,player1,deck,hand" },
                { "transition": "card9,player1,hand,play" },
                { "action": "card9,player1,attack,player2" },
                { "game": "endturn" }
            ]
        }
    ]
}
