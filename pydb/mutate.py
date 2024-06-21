from convex import ConvexClient, ConvexError
from pprint import pprint

def send_message(client, author, body):
    try:
        client.mutation("messages:send", dict(body = body, author = author))
        print("Message sent successfully!")
    except ConvexError as err:
        print(f"Error sending message: {err}")
    except Exception as err:
        print(f"Unexpected error: {err}")

def remove_messages(client):
    send_message(client, "Python pinger", "@gpt *DEL*")


def main():
    # Initialize the ConvexClient with the provided URL
    client = ConvexClient('https://cheerful-chicken-909.convex.cloud')
    LIST_ALL = False
    # Query the 'messages:list' endpoint to get the list of messages
    
    send_message(client, "Python pinger", "A boop from mutate.py was heard...")
    # remove_messages(client)
    # NOTE: If the DB is queried immediately after a user requests to remove messages,
    # the "..." GPT message will be present. This is okay, messages are scheduled to be deleted.
    if LIST_ALL:
        messages = client.query("messages:list")
    else:
        messages = client.query("messages:list5")
    
    # Use the pprint module to pretty print the messages
    pprint(messages)


main()
